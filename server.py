"""绝密行动 (Secret Mission) — aiohttp WebSocket server.

Serves static files, manages rooms, routes messages to game logic.
"""

import json
import asyncio
import logging
import os
from aiohttp import web
import aiohttp

from game_logic import GameState, Phase

logging.basicConfig(level=logging.INFO)
log = logging.getLogger('fengsheng')

# Room registry: room_id -> RoomState
rooms = {}


CONTENTION_TIMER_SECONDS = 7


class RoomState:
    def __init__(self, room_id):
        self.room_id = room_id
        self.players = {}   # user_id -> {'ws': ws, 'name': str}
        self.host = None     # user_id of first player (host)
        self.game = None     # GameState | None
        self.order = []      # Join order (for seating)
        self.contention_timer_task = None  # asyncio.Task | None


# ── Contention Timer ──────────────────────────────────────

async def start_contention_timer(room):
    if room.contention_timer_task and not room.contention_timer_task.done():
        room.contention_timer_task.cancel()
    room.contention_timer_task = asyncio.create_task(_contention_timer_callback(room))


async def stop_contention_timer(room):
    if room.contention_timer_task and not room.contention_timer_task.done():
        room.contention_timer_task.cancel()
    room.contention_timer_task = None


async def _contention_timer_callback(room):
    try:
        await asyncio.sleep(CONTENTION_TIMER_SECONDS)
    except asyncio.CancelledError:
        return
    try:
        if not room.game or room.game.phase != Phase.CONTENTION:
            return
        if room.game.contention_pending:
            return  # pending choice — don't end
        events = room.game.end_contention()
        await route_events(room, events)
        await _process_timer_signal(room)
    except Exception:
        log.exception('Error in contention timer callback')


async def _process_timer_signal(room):
    if not room.game:
        return
    signal = room.game.timer_signal
    room.game.timer_signal = None
    if signal == 'start_timer' or signal == 'reset_timer':
        await start_contention_timer(room)
        await broadcast(room, {
            'type': 'contention_timer_sync',
            'seconds': CONTENTION_TIMER_SECONDS,
        })
    elif signal == 'pause_timer':
        await stop_contention_timer(room)


# ── HTTP Routes ────────────────────────────────────────────

async def index_handler(request):
    return web.FileResponse(os.path.join(os.path.dirname(__file__), 'index.html'))


async def room_handler(request):
    return web.FileResponse(os.path.join(os.path.dirname(__file__), 'index.html'))


# ── WebSocket Handler ──────────────────────────────────────

async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    user_id = None
    room_id = None

    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                except json.JSONDecodeError:
                    await ws.send_json({'type': 'error', 'message': 'Invalid JSON'})
                    continue

                msg_type = data.get('type')

                if msg_type == 'enter_room':
                    user_id = data.get('id')
                    room_id = data.get('room')
                    name = data.get('name', 'Player')
                    await handle_enter_room(ws, user_id, room_id, name)

                elif not user_id or not room_id:
                    await ws.send_json({'type': 'error', 'message': '请先加入房间'})

                elif msg_type == 'start_game':
                    await handle_start_game(user_id, room_id)

                elif msg_type == 'action_play_card':
                    await handle_game_action(user_id, room_id, 'play_action_card',
                                             card_id=data.get('card_id'),
                                             target_id=data.get('target_id'),
                                             card_type=data.get('card_type'),
                                             intel_card_id=data.get('intel_card_id'))

                elif msg_type == 'action_done':
                    await handle_game_action(user_id, room_id, 'end_action_phase')

                elif msg_type == 'transmit_card':
                    await handle_game_action(user_id, room_id, 'transmit_intel',
                                             card_id=data.get('card_id'),
                                             target=data.get('target'),
                                             lock=data.get('lock'))

                elif msg_type == 'accept_intel':
                    await handle_game_action(user_id, room_id, 'accept_intel')

                elif msg_type == 'pass_intel':
                    await handle_game_action(user_id, room_id, 'pass_intel')

                elif msg_type == 'contention_play':
                    await handle_game_action(user_id, room_id, 'play_contention_card',
                                             card_id=data.get('card_id'))

                elif msg_type == 'decoy_direction':
                    await handle_game_action(user_id, room_id, 'resolve_decoy_direction',
                                             direction=data.get('direction'))

                elif msg_type == 'switch_card':
                    await handle_game_action(user_id, room_id, 'resolve_switch_card',
                                             swap_card_id=data.get('card_id'))

                elif msg_type == 'coerce_response':
                    await handle_game_action(user_id, room_id, 'resolve_coerce_response',
                                             card_id=data.get('card_id'))

                elif msg_type == 'clarify_play':
                    await handle_game_action(user_id, room_id, 'play_clarify_rescue',
                                             card_id=data.get('card_id'),
                                             intel_card_id=data.get('intel_card_id'))

                elif msg_type == 'clarify_pass':
                    await handle_game_action(user_id, room_id, 'pass_rescue')

                elif msg_type == 'death_gift':
                    await handle_game_action(user_id, room_id, 'death_gift',
                                             card_ids=data.get('card_ids', []),
                                             recipient_id=data.get('recipient_id'))

            elif msg.type == aiohttp.WSMsgType.ERROR:
                log.error('WebSocket error: %s', ws.exception())

    finally:
        if user_id and room_id:
            await handle_disconnect(user_id, room_id)

    return ws


# ── Room Management ────────────────────────────────────────

async def handle_enter_room(ws, user_id, room_id, name):
    if room_id not in rooms:
        rooms[room_id] = RoomState(room_id)

    room = rooms[room_id]

    # Reconnection: if user already in room, replace ws
    is_reconnect = user_id in room.players
    room.players[user_id] = {'ws': ws, 'name': name}

    if not is_reconnect:
        room.order.append(user_id)
        if room.host is None:
            room.host = user_id

    # If game is running, send state sync
    if room.game and room.game.phase != Phase.WAITING:
        state = room.game.get_state_for_player(user_id)
        if state:
            await ws.send_json(state)
            # Timer sync for contention phase
            if (room.game.phase == Phase.CONTENTION
                    and room.contention_timer_task
                    and not room.contention_timer_task.done()):
                await ws.send_json({
                    'type': 'contention_timer_sync',
                    'seconds': CONTENTION_TIMER_SECONDS,
                })
            return

    # Send room state to all
    await broadcast_room_state(room)


async def broadcast_room_state(room):
    player_list = []
    for uid in room.order:
        if uid in room.players:
            player_list.append({
                'id': uid,
                'name': room.players[uid]['name'],
                'is_host': uid == room.host,
            })

    can_start = len(player_list) >= 2  # Lowered for testing; should be 5

    for uid, p in room.players.items():
        try:
            await p['ws'].send_json({
                'type': 'room_state',
                'room_id': room.room_id,
                'players': player_list,
                'can_start': can_start and uid == room.host,
                'is_host': uid == room.host,
            })
        except Exception:
            pass


async def handle_start_game(user_id, room_id):
    room = rooms.get(room_id)
    if not room:
        return

    if user_id != room.host:
        ws = room.players[user_id]['ws']
        await ws.send_json({'type': 'error', 'message': '只有房主可以开始游戏'})
        return

    if len(room.order) < 2:  # Lowered for testing; should be 5
        ws = room.players[user_id]['ws']
        await ws.send_json({'type': 'error', 'message': '需要至少2名玩家'})
        return

    # Create game
    player_ids = [uid for uid in room.order if uid in room.players]
    player_names = [room.players[uid]['name'] for uid in player_ids]
    room.game = GameState(player_ids, player_names)

    try:
        events = room.game.setup()
        await route_events(room, events)
        await _process_timer_signal(room)
    except Exception as e:
        log.exception('Error during game setup')
        room.game = None
        ws = room.players[user_id]['ws']
        await ws.send_json({'type': 'error', 'message': f'游戏启动失败: {e}'})


async def handle_game_action(user_id, room_id, method_name, **kwargs):
    room = rooms.get(room_id)
    if not room or not room.game:
        return

    method = getattr(room.game, method_name, None)
    if not method:
        return

    try:
        events = method(user_id, **kwargs)
        await route_events(room, events)
        await _process_timer_signal(room)
    except Exception as e:
        log.exception('Error in game action %s', method_name)
        p = room.players.get(user_id)
        if p:
            try:
                await p['ws'].send_json({'type': 'error', 'message': f'操作失败: {e}'})
            except Exception:
                pass


async def handle_disconnect(user_id, room_id):
    room = rooms.get(room_id)
    if not room:
        return

    if user_id in room.players:
        del room.players[user_id]

    # If no game running, remove from order and clean up
    if not room.game or room.game.phase == Phase.WAITING:
        if user_id in room.order:
            room.order.remove(user_id)
        if room.host == user_id and room.order:
            room.host = room.order[0]

        if not room.players:
            del rooms[room_id]
            return

        await broadcast_room_state(room)
    else:
        # Game running — notify others player disconnected
        await broadcast(room, {
            'type': 'player_disconnected',
            'player_id': user_id,
        })


# ── Event Routing ──────────────────────────────────────────

async def route_events(room, events):
    for event in events:
        target = event['target']
        msg = event['msg']

        if target == 'all':
            await broadcast(room, msg)
        elif target.startswith('all_except:'):
            exclude = set(target.split(':')[1].split(','))
            await broadcast(room, msg, exclude=exclude)
        else:
            # Single player
            p = room.players.get(target)
            if p:
                try:
                    await p['ws'].send_json(msg)
                except Exception:
                    pass


async def broadcast(room, msg, exclude=None):
    exclude = exclude or set()
    for uid, p in room.players.items():
        if uid not in exclude:
            try:
                await p['ws'].send_json(msg)
            except Exception:
                pass


# ── App Factory ────────────────────────────────────────────

def create_app():
    app = web.Application()
    base_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(base_dir, 'static')

    app.router.add_get('/ws', websocket_handler)
    app.router.add_get('/', index_handler)
    app.router.add_get('/room/{room_id}', room_handler)
    app.router.add_static('/static/', static_dir)

    return app


if __name__ == '__main__':
    app = create_app()
    web.run_app(app, host='0.0.0.0', port=8080)
