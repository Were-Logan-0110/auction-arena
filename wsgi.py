"""PythonAnywhere WSGI entrypoint.

Point the PA web app's WSGI configuration file at this module. It exposes the
Flask app + Socket.IO through one WSGI application, so /api, /socket.io and the
built React app (web/dist) all share the same origin.

Deployment notes (PythonAnywhere, free tier):
  - Upload the whole repo (or `pip install` deps into a virtualenv).
  - Set the WSGI config file to this module.
  - Set the env var GEMINI_API_KEY in the PA web tab (or upload a .env).
  - No websocket support needed: async_mode=threading uses long-polling.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server import app

# flask-socketio patches app.wsgi_app with its own socketio middleware when
# SocketIO(app, ...) is constructed, so the Flask app *is* the WSGI app.
application = app
