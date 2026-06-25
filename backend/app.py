"""
Flask API for Text Similarity project.
Wires the existing frontend (index.html / style.css / script.js) to the
trained LightGBM + TF-IDF model.
ex : How can I improve my English speaking skills?

Run:
    $env:GEMINI_API_KEY="AIzaSyDbRyuGGa-4WA8fOnYhUBBSelegdpAqumg"
    
    python app.py
Then open frontend/index.html (it calls http://localhost:5000).
"""

import os
import re
import pickle
import numpy as np
import pandas as pd
from difflib import SequenceMatcher
from scipy.sparse import hstack
from sklearn.metrics.pairwise import cosine_similarity
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import google.generativeai as genai

try:
    import joblib
    _load = joblib.load
except ImportError:
    _load = lambda p: pickle.load(open(p, "rb"))

BASE = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.normpath(os.path.join(BASE, "..", "frontend"))

# ---------- Gemini setup ----------
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model_gemini = genai.GenerativeModel("gemini-2.5-flash")

# ---------- load artifacts ----------
model = _load(os.path.join(BASE, "model.pkl"))
tfidf = _load(os.path.join(BASE, "vectorizer.pkl"))

# ---------- load questions dataset for "Find Similar Questions" ----------
QUESTIONS_PATH = os.path.join(BASE, "questions.csv")
if os.path.exists(QUESTIONS_PATH):
    questions_df = pd.read_csv(QUESTIONS_PATH)
    # collect all unique questions from both columns
    q1_series = questions_df["question1"].dropna().astype(str)
    q2_series = questions_df["question2"].dropna().astype(str)
    all_questions = pd.Series(pd.concat([q1_series, q2_series]).unique(), name="question")
    corpus_df = pd.DataFrame({"question1": all_questions.values})
else:
    raise FileNotFoundError(
        "questions.csv not found. Place the dataset in the same folder as app.py."
    )

# ---------- preprocessing (matches notebook) ----------
def clean_text(text: str) -> str:
    text = str(text).lower()
    text = re.sub(r"https?://\S+|www\.\S+", "", text)
    text = re.sub(r"<.*?>", "", text)
    text = re.sub(r"can't", "cannot", text)
    text = re.sub(r"n't", " not", text)
    text = re.sub(r"\'s", " is", text)
    text = re.sub(r"\'ve", " have", text)
    text = re.sub(r"\'re", " are", text)
    text = re.sub(r"\'d", " would", text)
    text = re.sub(r"\'ll", " will", text)
    text = re.sub(r"[^a-zA-Z0-9\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def jaccard_sim(q1, q2):
    s1, s2 = set(q1.split()), set(q2.split())
    if not s1 or not s2:
        return 0.0
    return len(s1 & s2) / len(s1 | s2)


def word_share(q1, q2):
    s1, s2 = set(q1.split()), set(q2.split())
    return len(s1 & s2) / (len(s1) + len(s2) + 1)


def seq_sim(q1, q2):
    return SequenceMatcher(None, q1, q2).ratio()


def length_diff(q1, q2):
    return abs(len(q1.split()) - len(q2.split()))


def first_word_match(q1, q2):
    a, b = q1.split(), q2.split()
    if not a or not b:
        return 0
    return int(a[0] == b[0])


# pre-vectorize the corpus once
_corpus_clean = corpus_df["question1"].astype(str).apply(clean_text)
_corpus_vecs = tfidf.transform(_corpus_clean)


# ---------- Flask ----------
app = Flask(__name__, static_folder=None)
CORS(app)


@app.route("/api/predict", methods=["POST"])
def predict():
    data = request.get_json(force=True) or {}
    q1 = clean_text(data.get("question1", ""))
    q2 = clean_text(data.get("question2", ""))
    if not q1 or not q2:
        return jsonify({"error": "Both questions are required"}), 400

    feats = np.array([[
        jaccard_sim(q1, q2),
        word_share(q1, q2),
        seq_sim(q1, q2),
        length_diff(q1, q2),
        first_word_match(q1, q2),
        cosine_similarity(tfidf.transform([q1]), tfidf.transform([q2]))[0][0],
    ]])

    X = hstack([tfidf.transform([q1]), tfidf.transform([q2]), feats])
    pred = int(model.predict(X)[0])
    prob = float(model.predict_proba(X)[0][1])
    return jsonify({
        "prediction": pred,
        "probability": round(prob, 4),
        "label": "Duplicate" if pred == 1 else "Not Duplicate",
    })


@app.route("/api/search", methods=["POST"])
def search():
    data = request.get_json(force=True) or {}
    query = clean_text(data.get("query", ""))
    k = int(data.get("k", 3))
    if not query:
        return jsonify({"error": "Query is required"}), 400

    qv = tfidf.transform([query])
    sims = cosine_similarity(qv, _corpus_vecs)[0]
    idx = sims.argsort()[-k:][::-1]
    results = [
        {"text": str(corpus_df.iloc[i]["question1"]), "score": round(float(sims[i]), 4)}
        for i in idx
    ]
    return jsonify({"results": results})


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/chat", methods=["POST"])
def chat():
    """Chat endpoint powered by Gemini."""
    data = request.get_json(force=True) or {}
    messages = data.get("messages", [])
    if not messages:
        return jsonify({"error": "messages required"}), 400

    try:
        # Build conversation history for Gemini
        history = []
        for msg in messages[:-1]:
            role = "user" if msg["role"] == "user" else "model"
            history.append({"role": role, "parts": [msg["content"]]})

        chat_session = model_gemini.start_chat(history=history)
        response = chat_session.send_message(messages[-1]["content"])
        reply = response.text.strip() or "No response."
        return jsonify({"reply": reply})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Optionally serve the frontend so you can open http://localhost:5000
@app.route("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory(FRONTEND, path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)