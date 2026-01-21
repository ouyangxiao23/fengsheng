import json
import os
import mimetypes

# Global state to store game rooms
house = {}

async def application(scope, receive, send):
    """
    Main ASGI application entry point.
    """
    if scope['type'] == 'websocket':
        await handle_websocket(scope, receive, send)
    elif scope['type'] == 'http':
        await handle_http(scope, receive, send)

async def handle_http(scope, receive, send):
    """
    Handle HTTP requests for static files and the main HTML page.
    """
    request = await receive()
    if request['type'] != 'http.request':
        return

    path = scope['path']
    
    if path.startswith('/static/'):
        file_path = path.lstrip('/') # remove leading slash to make it relative
        # Security check to prevent directory traversal
        full_path = os.path.abspath(file_path)
        static_root = os.path.abspath('static')
        
        if full_path.startswith(static_root) and os.path.exists(full_path) and os.path.isfile(full_path):
            mime_type, _ = mimetypes.guess_type(full_path)
            with open(full_path, 'rb') as f:
                content = f.read()
            await send({'type': 'http.response.start', 'status': 200, 'headers': [(b'content-type', (mime_type or 'application/octet-stream').encode('utf-8'))]})
            await send({'type': 'http.response.body', 'body': content})
        else:
            await send({'type': 'http.response.start', 'status': 404})
            await send({'type': 'http.response.body', 'body': b'Not Found'})
    else:
        # Serve index.html for main page and client-side routing fallback
        if os.path.exists('index.html'):
            with open('index.html', 'rb') as fp:
                html = fp.read()
            await send({'type': 'http.response.start', 'status': 200, 'headers': [(b'content-type', b'text/html')]})
            await send({'type': 'http.response.body', 'body': html})
        else:
            await send({'type': 'http.response.start', 'status': 404})
            await send({'type': 'http.response.body', 'body': b'Index.html not found'})

async def handle_websocket(scope, receive, send):
    """
    Handle WebSocket connections for the game logic.
    """
    event = await receive()
    if event['type'] != 'websocket.connect':
        return
    await send({'type': 'websocket.accept'})
    
    event = await receive()
    try:
        data = json.loads(event['text'])
    except (json.JSONDecodeError, KeyError):
        await send({'type': 'websocket.close', 'code': 4000})
        return

    # Validate initialization message
    if data.get('type') != 'EnterRoom' or not data.get('id') or not data.get('room'):
        await send({'type': 'websocket.close', 'code': 403})
        return

    room_id = data['room']
    user_id = data['id']
    
    if room_id not in house:
        house[room_id] = {
            'black': None,
            'white': None,
            'pieces': [],
            'sends': [],
            'users': [],
        }
    
    room = house[room_id]
    old = False
    
    # Handle user reconnect or existing user logic
    if room['black'] == user_id or room['white'] == user_id:
        old = True
        if user_id in room['users']:
            try:
                # Find the previous connection for this user
                idx = room['users'].index(user_id)
                old_send = room['sends'][idx]
                
                # Remove old connection info
                room['sends'].pop(idx)
                room['users'].pop(idx)
                
                # Close the old connection
                await old_send({'type': 'websocket.close', 'code': 4000})
            except (ValueError, IndexError):
                pass
    else:
        # Assign roles to new players
        if room['black'] is None:
            room['black'] = user_id
        elif room['white'] is None:
            room['white'] = user_id
            
    visiting = room['black'] != user_id and room['white'] != user_id
    
    room['sends'].append(send)
    room['users'].append(user_id)
    
    # Send initial state
    await send({'type': 'websocket.send', 'text': json.dumps({
        'type': 'InitializeRoomState',
        'pieces': room['pieces'],
        'visiting': visiting,
        'black': room['black'] == user_id if not visiting else bool(len(room['pieces']) % 2),
        'ready': bool(room['black'] and room['white']),
    })})

    # Notify others if a player (re)connected
    if not old and (room['black'] == user_id or room['white'] == user_id):
        notification = json.dumps({
            'type': 'AddPlayer',
            'ready': bool(room['black'] and room['white']),
        })
        for _send in room['sends']:
            if _send == send:
                continue
            await _send({'type': 'websocket.send', 'text': notification})

    # Main game loop
    try:
        while True:
            event = await receive()
            if event['type'] == 'websocket.disconnect':
                break
            
            if 'text' in event:
                try:
                    data = json.loads(event['text'])
                    if data.get('type') == 'DropPiece':
                        room['pieces'].append((data['x'], data['y']))
                        # Broadcast move to others
                        move_data = json.dumps({
                            'type': 'DropPiece',
                            'x': data['x'],
                            'y': data['y'],
                        })
                        for _send in room['sends']:
                            if _send == send:
                                continue
                            await _send({'type': 'websocket.send', 'text': move_data})
                except json.JSONDecodeError:
                    pass
    finally:
        # Cleanup connection
        if room_id in house:
            room = house[room_id]
            if send in room['sends']:
                try:
                    idx = room['sends'].index(send)
                    room['sends'].pop(idx)
                    room['users'].pop(idx)
                except ValueError:
                    pass
            
            # If room is empty, remove it to save memory
            if len(room['pieces']) == 0 and len(room['sends']) == 0:
                del house[room_id]
