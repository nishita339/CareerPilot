"""
CareerPilot — AI/ML Live Inference CLI
=======================================
Usage:
  py ml_pipeline/inference.py
  py ml_pipeline/inference.py --resume path/to/resume.txt --job path/to/job.txt
"""

import sys
import argparse
import json
import os
from train_ats_model import (
    LogisticRegressionModel,
    extract_feature_vector,
    tokenize,
    TECH_BIGRAMS
)

def load_model() -> LogisticRegressionModel:
    model = LogisticRegressionModel(n_features=4)
    weights_path = os.path.join(os.path.dirname(__file__), "model_weights.json")
    if os.path.exists(weights_path):
        with open(weights_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            model.weights = data.get("weights", [3.2, 2.0, 3.8, 2.6])
            model.bias = data.get("bias", -3.0)
    else:
        # Default fallback calibrated weights
        model.weights = [3.18, 2.03, 3.78, 2.60]
        model.bias = -2.99
    return model

def analyze_resume_job(resume_text: str, job_text: str):
    model = load_model()
    features = extract_feature_vector(resume_text, job_text)
    prob = model.predict_proba(features)

    r_tokens = set(tokenize(resume_text))
    j_tokens = set(tokenize(job_text))

    missing = [t for t in j_tokens if t not in r_tokens][:6]
    matched = [t for t in j_tokens if t in r_tokens][:6]

    # Weighted ATS composite score
    ats_score = int(round(
        (features[0] * 35) +
        (features[1] * 20) +
        (features[2] * 30) +
        (features[3] * 15)
    )) * 100 // 100
    ats_score = max(15, min(95, ats_score))
    potential_score = min(98, ats_score + len(missing) * 6)

    print("\n" + "=" * 60)
    print("      CareerPilot — ATS & Callback Predictor")
    print("=" * 60)
    print(f"  Current ATS Match       : {ats_score}/100")
    print(f"  Potential Post-Opt ATS  : {potential_score}/100")
    print(f"  Est. Callback Chance    : {prob * 100:.1f}%\n")
    print("  Mathematical Metrics:")
    print(f"    - Cosine Similarity   : {features[0]:.4f} (TF-IDF vector alignment)")
    print(f"    - Jaccard Index       : {features[1]:.4f} (Vocabulary intersection)")
    print(f"    - Keyword Density     : {features[2]:.4f} (Requirements overlap)")
    print(f"    - Action Verb Ratio   : {features[3]:.4f} (STAR leadership phrasing)\n")

    if matched:
        print(f"  Matched Key Terms       : {', '.join(matched)}")
    if missing:
        print(f"  Missing Critical Skills : {', '.join(missing)}\n")

    print("  Actionable STAR Recommendation:")
    print("    Rewrite bullets with quantifiable engineering impacts.")
    print("    Example: \"Engineered distributed pipelines with PyTorch and Docker,")
    print("              reducing model training latency by 35% on cloud clusters.\"")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CareerPilot AI/ML ATS Inference")
    parser.add_argument("--resume", type=str, help="Path to resume plain text file")
    parser.add_argument("--job", type=str, help="Path to job description text file")
    args = parser.parse_args()

    if args.resume and args.job:
        with open(args.resume, "r", encoding="utf-8") as f:
            r_text = f.read()
        with open(args.job, "r", encoding="utf-8") as f:
            j_text = f.read()
    else:
        # Default test showcase
        r_text = """
        AI Engineer with experience in Python, PyTorch, and Computer Vision.
        Developed convolutional neural networks for image classification with 94% accuracy.
        Deployed deep learning models with Docker on AWS.
        """
        j_text = """
        Machine Learning Engineer: Require strong proficiency in Python and PyTorch.
        Experience in computer vision, deep learning, Docker, and Kubernetes deployment.
        """

    analyze_resume_job(r_text, j_text)
