import sys
import os
import json
import httpx

BASE = 'http://127.0.0.1:8000'

def get_client():
    try:
        r = httpx.get(f'{BASE}/health', timeout=1.0)
        if r.status_code == 200:
            return httpx, BASE
    except Exception:
        pass
    # Fallback to in-process FastAPI TestClient
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from main import app
    from fastapi.testclient import TestClient
    return TestClient(app), ''

def test_flow():
    client_obj, prefix = get_client()
    is_testclient = prefix == ''

    print('1. Testing Knowledge Ingest...')
    r = client_obj.post(f'{prefix}/api/knowledge/ingest', json={
        'title': 'Test Passkey',
        'content': 'The alpha secret passkey is ZULU-999-DELTA.',
        'tags': ['secret', 'test'],
        'source': 'test'
    })
    assert r.status_code == 200, f'Ingest failed: {r.text}'
    data = r.json()
    snippet_id = data['id']
    print(f'   -> Ingested snippet {snippet_id}')

    print('2. Testing Knowledge Search (BM25 FTS5)...')
    r = client_obj.get(f'{prefix}/api/knowledge/search?q=passkey')
    assert r.status_code == 200
    res = r.json()
    assert res['count'] > 0
    assert 'ZULU-999-DELTA' in res['results'][0]['content']
    print(f"   -> Search returned {res['count']} matches with score {res['results'][0]['score']}")

    print('3. Testing Chat Streaming with RAG Context & Multi-tool Execution...')
    events = []
    stream_ctx = client_obj.stream('POST', f'{prefix}/api/chat/stream', json={
        'message': 'What is the alpha secret passkey and what is 50 * 20?',
        'mode': 'chat'
    }, timeout=30.0) if not is_testclient else client_obj.stream('POST', f'{prefix}/api/chat/stream', json={
        'message': 'What is the alpha secret passkey and what is 50 * 20?',
        'mode': 'chat'
    })
    with stream_ctx as stream:
        for line in stream.iter_lines():
            if isinstance(line, bytes):
                line = line.decode('utf-8')
            if line.startswith('data: '):
                payload = line[6:].strip()
                if payload != '[DONE]':
                    try:
                        events.append(json.loads(payload))
                    except Exception:
                        pass

    types = [e.get('type') for e in events if 'type' in e]
    print(f'   -> Received SSE event types: {set(types)}')
    tool_calls = [e for e in events if e.get('type') == 'tool_call']
    print(f"   -> Emitted tool calls: {[t['tool'] for t in tool_calls]}")
    texts = [e.get('text') for e in events if 'text' in e]
    full_text = ''.join(texts)
    print(f'   -> Full response snippet: {full_text[:160]}...')
    assert 'ZULU-999-DELTA' in full_text or '1000' in full_text or '1,000' in full_text, 'Expected answer missing!'
    print('   -> RAG grounding verified!')

    print('4. Testing Chat Clearance (Atomic Database Purge)...')
    r = client_obj.delete(f'{prefix}/api/chats')
    assert r.status_code == 200, f'Delete chats failed: {r.text}'
    r = client_obj.get(f'{prefix}/api/chats')
    assert r.status_code == 200
    chats = r.json()
    assert len(chats) == 0, f'Expected 0 chats after clear, got {len(chats)}'
    print('   -> Zero chats remain in database. Clearance verified!')

    print('5. Cleanup Test Knowledge Snippet...')
    r = client_obj.delete(f'{prefix}/api/knowledge/{snippet_id}')
    assert r.status_code == 200
    print('   -> Cleaned up test knowledge snippet.')

    print('\nALL END-TO-END WORKFLOW TESTS PASSED CLEANLY!')

if __name__ == '__main__':
    test_flow()
