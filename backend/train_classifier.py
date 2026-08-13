import os
import pandas as pd
import numpy as np
import pickle
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

print("Starting lightweight AI model training pipeline...")

# Load our generated mock metadata dataset
csv_path = os.path.join('data', 'cloud_metadata.csv')
if not os.path.exists(csv_path):
    raise FileNotFoundError("Run generate_mock_data.py first to create the source dataset!")

df = pd.read_csv(csv_path)

# Rule-based Ground Truth Labeling for training 
# (Files untouched for >180 days with 0 recent access are classified as Dark Data)
df['is_dark'] = np.where((df['days_since_last_accessed'] > 180) & (df['access_count_30d'] == 0), 1, 0)

# Select features for our Green AI classifier (Metadata traits only)
features = ['file_size_mb', 'days_since_creation', 'days_since_last_accessed', 'access_count_30d']
X = df[features]
y = df['is_dark']

# Split data into training and validation sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Initialize a highly lightweight Random Forest
# Max_depth is restricted to keep the computational memory footprint extremely low (TinyML principles)
model = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
model.fit(X_train, y_train)

# Evaluate performance
predictions = model.predict(X_test)
accuracy = accuracy_score(y_test, predictions)
print(f"Model Training Complete! Baseline Validation Accuracy: {accuracy * 100:.2f}%")

# Save the trained model binary cleanly to disk
os.makedirs('models', exist_ok=True)
model_path = os.path.join('models', 'dark_data_classifier.pkl')
with open(model_path, 'wb') as f:
    pickle.dump(model, f)

print(f"Model successfully saved as a lightweight artifact at: {model_path}")