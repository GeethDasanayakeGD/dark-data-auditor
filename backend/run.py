import os
from flask_cors import CORS
from app import create_app


app = create_app()


CORS(app)

if __name__ == "__main__":
  print("--------------------------------------------------")
  print("Starting Energy-Aware Dark Data Auditor Backend...")
  print("--------------------------------------------------")

  
  port = int(os.environ.get("PORT", 5000))

  
  app.run(debug=False, host="0.0.0.0", port=port, threaded=True)