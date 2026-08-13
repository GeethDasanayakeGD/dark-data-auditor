"""
research_engine.py

This module answers the question your supervisor asked: "Which AI model
is actually the best choice for this project?" It trains SEVERAL different
models on the same dataset, times how long each one takes to train,
estimates the carbon footprint of that training time, and reports back
accuracy + F1 score + carbon cost for each - so you can compare them
side by side and justify your final model choice with real numbers.
"""

import time
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.metrics import accuracy_score, f1_score


def generate_research_dataset(num_samples=2000):
    """
    Creates a synthetic dataset specifically for benchmarking (separate from
    your main dashboard dataset). Includes some deliberately "noisy" labels
    (10% randomly flipped) to simulate messy real-world data, since a
    perfectly clean dataset makes every model look equally good.
    """
    np.random.seed(42)

    file_size_mb = np.random.exponential(scale=500, size=num_samples) + 1
    days_since_creation = np.random.randint(30, 1000, size=num_samples)
    days_since_last_access = np.array([np.random.randint(1, c) for c in days_since_creation])
    # File Types: 0:Doc, 1:Video, 2:Image, 3:Archive(Zip), 4:System File
    file_type_encoded = np.random.randint(0, 5, size=num_samples)

    is_dark_data = []
    for i in range(num_samples):
        score = 0
        if days_since_last_access[i] > 180:
            score += 3
        if days_since_creation[i] > 365:
            score += 2
        if file_size_mb[i] > 1000:
            score += 1
        if file_type_encoded[i] in [3, 4]:
            score += 1

        base_label = 1 if score >= 4 else 0

        # Inject noise: flip 10% of labels randomly to simulate messy real-world data
        if np.random.rand() < 0.10:
            base_label = 1 - base_label

        is_dark_data.append(base_label)

    return pd.DataFrame({
        'file_size_mb': file_size_mb,
        'days_since_creation': days_since_creation,
        'days_since_last_access': days_since_last_access,
        'file_type_encoded': file_type_encoded,
        'is_dark_data': is_dark_data
    })


def calculate_training_carbon(execution_time_sec, num_watts=65):
    """
    Green AI formula: converts training time into an estimated carbon cost.
    Assumes a standard desktop CPU draws ~65 watts under load, and uses a
    reference grid carbon intensity figure to convert energy into CO2.
    Returned in milligrams of CO2, since these training runs are short
    and the true numbers are tiny (this is why "AI models expend energy" is
    listed as a risk in your proposal - it's real, just small at this scale).
    """
    energy_wh = (execution_time_sec * num_watts) / 3600
    carbon_intensity_g_per_wh = 0.475  # reference grid carbon intensity
    carbon_mg = energy_wh * carbon_intensity_g_per_wh * 1000
    return round(carbon_mg, 4)


def run_multi_model_benchmark(num_samples=800):
    """
    Trains 5 different classifier types on the same dataset and returns a
    comparison: accuracy, F1 score, training time, and estimated carbon
    footprint for each - so you can justify which model is the best
    trade-off between accuracy and energy efficiency.

    Note: uses LinearSVC (not SVC with kernel='linear') for the "Linear SVM"
    entry - both represent the same algorithm family, but SVC's general-purpose
    solver is dramatically slower to train and was causing the benchmark to
    take 30+ seconds or appear to hang. LinearSVC uses a solver built
    specifically for the linear case and gives comparable results in a
    fraction of the time.
    """
    df = generate_research_dataset(num_samples)

    features = ['file_size_mb', 'days_since_creation', 'days_since_last_access', 'file_type_encoded']
    X = df[features]
    y = df['is_dark_data']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)

    models = {
        "Decision Tree": DecisionTreeClassifier(max_depth=6, random_state=42),
        "Random Forest": RandomForestClassifier(n_estimators=50, max_depth=6, random_state=42),
        "Logistic Regression": LogisticRegression(max_iter=1000),
        "Linear SVM": LinearSVC(max_iter=2000, dual="auto"),
        "Gradient Boosting": GradientBoostingClassifier(n_estimators=50, max_depth=3, random_state=42),
    }

    results = []
    for name, model in models.items():
        start_time = time.time()
        model.fit(X_train, y_train)
        training_time_sec = time.time() - start_time

        predictions = model.predict(X_test)
        accuracy = accuracy_score(y_test, predictions)
        f1 = f1_score(y_test, predictions)
        carbon_mg = calculate_training_carbon(training_time_sec)

        results.append({
            "model_name": name,
            "accuracy_percent": round(accuracy * 100, 2),
            "f1_score_percent": round(f1 * 100, 2),
            "training_time_sec": round(training_time_sec, 4),
            "carbon_footprint_mg": carbon_mg,
        })

    return results
