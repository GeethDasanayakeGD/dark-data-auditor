from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

def create_app():
    # Load AWS credentials (and any other secrets) from a local .env file.
    # This file is never committed to git and never shared - see .env.example.
    load_dotenv()

    # Initialize the core Flask application
    app = Flask(__name__)
    
    # Enable Cross-Origin Resource Sharing (CORS) 
    # This allows your React dashboard on Port 3000 to talk to this API on Port 5000
    CORS(app)

    # Register blueprints (routes)
    from app.routes import main_bp
    app.register_blueprint(main_bp)

    return app