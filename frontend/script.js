document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = window.API_BASE || "http://localhost:5000";

  /* =========================
     FLOATING PARTICLES
  ========================= */
  function createParticles() {
    const container = document.getElementById("particles");
    if (!container) return;
    const count = 30;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      p.style.left = Math.random() * 100 + "%";
      p.style.animationDelay = Math.random() * 15 + "s";
      p.style.animationDuration = 15 + Math.random() * 10 + "s";
      if (Math.random() > 0.5) p.style.background = "#00B2FF";
      container.appendChild(p);
    }
  }
  createParticles();

  /* =========================
     MOBILE MENU
  ========================= */
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");
  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
      menuToggle.classList.toggle("active");
      navLinks.classList.toggle("active");
    });
  }

  /* =========================
     PREPROCESSING TABS
  ========================= */
  const tabs = document.querySelectorAll(".tab-item");
  const panels = document.querySelectorAll(".content-panel");
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      if (panels[index]) panels[index].classList.add("active");
    });
  });

  /* =========================
     EXPERIENCE TABS
  ========================= */
  const expTabs = document.querySelectorAll(".exp-tab");
  const expPanels = document.querySelectorAll(".exp-panel");
  expTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      expTabs.forEach((t) => t.classList.remove("active"));
      expPanels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      const mode = tab.dataset.mode;
      const panel = document.getElementById(mode);
      if (panel) {
        panel.classList.add("active");
        panel.querySelectorAll("input").forEach((i) => (i.value = ""));
        const circle = panel.querySelector(".score-circle");
        const label = panel.querySelector("p");
        if (circle) {
          circle.textContent = "0.00";
          circle.style.background =
            "conic-gradient(#9e92e7 0%, rgba(255,255,255,0.1) 0%)";
        }
        if (label) label.textContent = "Waiting...";
        const list = panel.querySelector(".results-list");
        if (list) list.innerHTML = "";
      }
    });
  });

  /* =========================
     MODE 1 - PREDICT (Flask API)
  ========================= */
  const predictBtn = document.getElementById("predictBtn");
  if (predictBtn) {
    predictBtn.addEventListener("click", async () => {
      const q1 = document.getElementById("question1").value.trim();
      const q2 = document.getElementById("question2").value.trim();
      const circle = document.getElementById("pairScore");
      const label = document.getElementById("pairLabel");
      if (!q1 || !q2) return;

      if (circle) circle.textContent = "...";
      predictBtn.disabled = true;

      try {
        const res = await fetch(`${API_BASE}/api/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question1: q1, question2: q2 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed");

        const score = Number(data.probability).toFixed(2);
        const percent = score * 100;
        if (circle) {
          circle.textContent = score;
          circle.style.background = `conic-gradient(#9e92e7 ${percent}%, rgba(255,255,255,0.1) 0%)`;
        }
        if (label) label.textContent = data.label;
      } catch (err) {
        if (circle) circle.textContent = "Err";
        if (label) label.textContent = err.message;
      } finally {
        predictBtn.disabled = false;
      }
    });
  }

  /* =========================
     MODE 2 - SEARCH (Flask API)
  ========================= */
  const searchBtn = document.getElementById("searchBtn");
  if (searchBtn) {
    searchBtn.addEventListener("click", async () => {
      const input = document.getElementById("searchQuestion");
      const container = document.getElementById("resultsList");
      if (!input.value.trim()) return;

      container.innerHTML = "<p style='opacity:.6'>Loading...</p>";
      searchBtn.disabled = true;

      try {
        const res = await fetch(`${API_BASE}/api/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: input.value.trim(), k: 3 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed");

        container.innerHTML = "";
        (data.results || []).forEach((r) => {
          const div = document.createElement("div");
          div.className = "result-item";
          div.innerHTML = `<p>${r.text}</p><span>${Number(r.score).toFixed(2)}</span>`;
          container.appendChild(div);
        });
      } catch (err) {
        container.innerHTML = `<p style='color:#ff6b6b'>${err.message}</p>`;
      } finally {
        searchBtn.disabled = false;
      }
    });
  }

  /* =========================
     NAV SCROLL EFFECT
  ========================= */
  const nav = document.getElementById("navbar");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 50) nav.classList.add("scrolled");
    else nav.classList.remove("scrolled");
  });

  /* =========================
     SCROLL SPY
  ========================= */
  const sections = document.querySelectorAll("section");
  const navItems = document.querySelectorAll(".nav-links a");
  window.addEventListener("scroll", () => {
    let current = "";
    sections.forEach((section) => {
      const top = section.offsetTop;
      const height = section.clientHeight;
      if (window.scrollY >= top - height / 3) {
        current = section.getAttribute("id");
      }
    });
    navItems.forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("href").includes(current))
        link.classList.add("active");
    });
  });

  /* =========================
     MODE 3 - WEB SEARCH CHATBOT (Anthropic API)
  ========================= */
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");
  const chatMessages = document.getElementById("chatMessages");

  const chatHistory = [];

  function appendBubble(text, role) {
    const div = document.createElement("div");
    div.className = `chat-bubble ${role}`;
    div.innerHTML = `<span>${text.replace(/\n/g, "<br>")}</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  function showTyping() {
    const div = document.createElement("div");
    div.className = "chat-bubble bot typing";
    div.id = "typingIndicator";
    div.innerHTML = `<span>●</span><span>●</span><span>●</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById("typingIndicator");
    if (t) t.remove();
  }

  async function sendChat() {
    const question = chatInput.value.trim();
    if (!question) return;

    appendBubble(question, "user");
    chatHistory.push({ role: "user", content: question });
    chatInput.value = "";
    chatSendBtn.disabled = true;
    showTyping();

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory }),
      });

      const data = await response.json();
      removeTyping();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      const replyText = data.reply || "لم أتمكن من الحصول على إجابة.";
      chatHistory.push({ role: "assistant", content: replyText });
      appendBubble(replyText, "bot");
    } catch (err) {
      removeTyping();
      appendBubble(`⚠️ خطأ: ${err.message}`, "bot");
    } finally {
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  }

  if (chatSendBtn) chatSendBtn.addEventListener("click", sendChat);
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });
  }
});
