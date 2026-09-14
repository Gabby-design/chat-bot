import sys
import os

# Add server directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(current_dir)
server_dir = os.path.join(root_dir, 'ai-assistant', 'server')

if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

# Ensure writable DB location in Vercel serverless environment
if not os.getenv("DB_PATH"):
    os.environ["DB_PATH"] = "/tmp/chat.db"

# Load server/.env if available locally
dotenv_path = os.path.join(server_dir, '.env')
if os.path.exists(dotenv_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(dotenv_path, override=False)
    except Exception:
        pass

from main import app
