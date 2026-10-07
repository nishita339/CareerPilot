# CareerPilot — Machine Learning & NLP Architecture

This directory contains the core offline Machine Learning research, training, and evaluation pipeline for **CareerPilot**. It mirrors and calibrates the live production engine implemented in `src/convex/mlResumeAnalyzer.ts`.

---

## 📐 Mathematical Formulation

### 1. Vector Space Model & Term Frequency (TF-IDF)
Resumes and job descriptions are preprocessed into unigrams and domain-specific technical bigrams (e.g., *"machine learning"*, *"neural networks"*, *"ci/cd"*). Term frequency is normalized across document token length:
$$\text{TF}(t, d) = \frac{f_{t, d}}{\sum_{t' \in d} f_{t', d}}$$

### 2. Directional Semantic Alignment (Cosine Similarity)
The angular alignment between the candidate resume vector $\mathbf{u}$ and opportunity requirement vector $\mathbf{v}$ is computed via the Euclidean dot product:
$$\text{Cosine Similarity} = \cos(\theta) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\|_2 \|\mathbf{v}\|_2} = \frac{\sum_{i=1}^n u_i v_i}{\sqrt{\sum_{i=1}^n u_i^2} \sqrt{\sum_{i=1}^n v_i^2}}$$

### 3. Domain Vocabulary Coverage (Jaccard Index)
To penalize candidate resumes missing broad domain vocabulary, the Jaccard similarity coefficient measures set intersection over union:
$$J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$

### 4. Probabilistic Interview Callback Model (Sigmoid Classifier)
Given a multi-dimensional feature vector:
$$\mathbf{x} = \begin{bmatrix} \text{Cosine Similarity} \\ \text{Jaccard Index} \\ \text{Job Keyword Density} \\ \text{Action Verb Ratio} \end{bmatrix}$$

The likelihood of securing an interview callback is estimated using a calibrated logistic function:
$$P(\text{Callback} \mid \mathbf{x}) = \sigma(\mathbf{w}^T \mathbf{x} + b) = \frac{1}{1 + e^{-(\mathbf{w}^T \mathbf{x} + b)}}$$

### 5. Optimization & Objective Function
Parameters $(\mathbf{w}, b)$ are optimized by minimizing Binary Cross-Entropy (Log Loss) with $L_2$ regularization:
$$\mathcal{L}(\mathbf{w}, b) = -\frac{1}{m} \sum_{i=1}^m \left[ y^{(i)} \log(\hat{y}^{(i)}) + (1 - y^{(i)}) \log(1 - \hat{y}^{(i)}) \right] + \frac{\lambda}{2m} \|\mathbf{w}\|_2^2$$

---

## 🚀 How to Run

### 1. Train and Evaluate Model
```bash
py ml_pipeline/train_ats_model.py
```
**Output:**
- Prints learned weights $w_j$ and bias $b$.
- Generates Accuracy, Precision, Recall, and Confusion Matrix.
- Exports calibrated weights to `ml_pipeline/model_weights.json`.

### 2. Run Live Inference
```bash
py ml_pipeline/inference.py
```
Or with custom resume and job text files:
```bash
py ml_pipeline/inference.py --resume path/to/resume.txt --job path/to/job.txt
```

---

## 🔄 Dual Pipeline Architecture (Research & Production)

| Pipeline | Language | Role | Key File |
| :--- | :--- | :--- | :--- |
| **Research & Calibration** | **Python** | Model training, loss optimization, metrics benchmark | `ml_pipeline/train_ats_model.py` |
| **Production Inference** | **TypeScript** | Real-time edge evaluation, Convex cloud queries, UI rendering | `src/convex/mlResumeAnalyzer.ts` |
