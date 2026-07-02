X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

lgb_model = lgb.LGBMClassifier(
    n_estimators=1000,
    learning_rate=0.05,
    num_leaves=31,
    class_weight='balanced',
    random_state=42
)

lgb_model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    callbacks=[early_stopping(50), log_evaluation(50)]
)

# %%
def predict_pair(q1, q2):

    q1 = clean_text(q1)
    q2 = clean_text(q2)

    jacc = jaccard_sim(q1, q2)
    wshare = word_share(q1, q2)
    seq = seq_sim(q1, q2)
    ldiff = length_diff(q1, q2)
    first = first_word_match(q1, q2)

    q1_vec = tfidf.transform([q1])
    q2_vec = tfidf.transform([q2])

    cos = cosine_similarity(q1_vec, q2_vec)[0][0]

    feat = np.array([[jacc, wshare, seq, ldiff, first, cos]])

    X_new = hstack([q1_vec, q2_vec, feat])

    pred = lgb_model.predict(X_new)[0]
    prob = lgb_model.predict_proba(X_new)[0][1]

    return pred, prob

# %%
# Predictions on test set
y_pred = lgb_model.predict(X_test)

# Probabilities
y_prob = lgb_model.predict_proba(X_test)[:, 1]