// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "usuarios.json");
const QUESTIONS_FILE = path.join(DATA_DIR, "perguntas.json");

// ----- Helpers -----
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const txt = fs.readFileSync(filePath, "utf8");
  try { return JSON.parse(txt || "[]"); } catch (e) { return []; }
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(USERS_FILE)) writeJSON(USERS_FILE, []);
  if (!fs.existsSync(QUESTIONS_FILE)) writeJSON(QUESTIONS_FILE, []);
}
ensureDataFiles();

function hojeStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function dateNDaysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ----- AUTH HELPERS -----
function isAdminEmail(email) {
  const users = readJSON(USERS_FILE);
  const u = users.find(x => x.email === email && x.tipo === "admin");
  return !!u;
}

// ----- ROUTES -----

// Health
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));

// ---------- LOGIN (aluno) ----------
// server.js (TRECHO CORRIGIDO)
// ---------- LOGIN (aluno) ----------
app.post("/login", (req, res) => {
  const { email, senha } = req.body || {}; // Mantemos 'senha' aqui por convenção, mas não a usaremos para alunos.
  const users = readJSON(USERS_FILE);

  // 1. Encontra o usuário APENAS pelo email.
  const user = users.find(u => u.email === email); 
  
  if (!user) {
      return res.status(401).json({ success: false, message: "E-mail não encontrado." });
  }

  // 2. Se for 'aluno', permite o acesso apenas com o email (login sem senha).
  if (user.tipo === "aluno") {
      // Login bem-sucedido para o aluno
      return res.json({ success: true, nome: user.nome, tipo: user.tipo, email: user.email, ebcoins: user.ebcoins || 0 });
  } 
  
  // 3. Se for 'admin', verifica a senha (mantendo a segurança para admins).
  if (user.tipo === "admin" && user.senha === senha) {
      // Se um admin tentar logar na tela de aluno, ele pode ir para o painel de admin
      return res.json({ success: true, nome: user.nome, tipo: user.tipo, email: user.email, ebcoins: user.ebcoins || 0 });
  }
  
  // 4. Caso seja admin, mas a senha esteja errada, ou outro tipo de falha
  return res.status(401).json({ success: false, message: "Acesso negado. Senha incorreta ou e-mail inválido." });
});

// ---------- ADMIN LOGIN (via email+senha) ----------
app.post("/admin/login", (req, res) => {
  const { email, senha } = req.body || {};
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.email === email && u.senha === senha && u.tipo === "admin");
  if (!user) return res.status(401).json({ success: false, message: "Acesso negado." });
  return res.json({ success: true, nome: user.nome, email: user.email });
});

// ---------- ADMIN: criar usuário (aluno ou admin) ----------
app.post("/admin/criarUsuario", (req, res) => {
  const { adminEmail, nome, email, senha, tipo } = req.body || {};
  if (!isAdminEmail(adminEmail)) return res.status(403).json({ success: false, message: "Acesso negado." });

  const users = readJSON(USERS_FILE);
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ success: false, message: "Email já cadastrado." });
  }

  const novo = {
    nome,
    email,
    senha,
    tipo: tipo === "admin" ? "admin" : "aluno",
    ebcoins: 0,
    perguntasRespondidas: [] // { id, data: 'YYYY-MM-DD' }
  };
  users.push(novo);
  writeJSON(USERS_FILE, users);
  return res.json({ success: true, message: "Usuário criado." });
});

// ---------- ADMIN: listar usuários ----------
app.get("/admin/usuarios", (req, res) => {
  const adminEmail = req.query.adminEmail;
  if (!isAdminEmail(adminEmail)) return res.status(403).json({ success: false, message: "Acesso negado." });
  const users = readJSON(USERS_FILE);
  return res.json(users);
});

// ---------- ADMIN: perguntas CRUD ----------
app.get("/admin/perguntas", (req, res) => {
  const adminEmail = req.query.adminEmail;
  if (!isAdminEmail(adminEmail)) return res.status(403).json({ success: false, message: "Acesso negado." });
  const qs = readJSON(QUESTIONS_FILE);
  res.json(qs);
});

app.post("/admin/perguntas", (req, res) => {
  const adminEmail = req.body.adminEmail;
  if (!isAdminEmail(adminEmail)) return res.status(403).json({ success: false, message: "Acesso negado." });
  const { texto, opcoes, correta, dificuldade } = req.body;
  const qs = readJSON(QUESTIONS_FILE);
  const id = qs.length ? (Math.max(...qs.map(q => q.id)) + 1) : 1;
  const nova = { id, texto, opcoes, correta, dificuldade }; // dificuldade: "facil","media","dificil"
  qs.push(nova);
  writeJSON(QUESTIONS_FILE, qs);
  res.json({ success: true, message: "Pergunta adicionada.", pergunta: nova });
});

app.put("/admin/perguntas/:id", (req, res) => {
  const adminEmail = req.body.adminEmail;
  if (!isAdminEmail(adminEmail)) return res.status(403).json({ success: false, message: "Acesso negado." });
  const id = parseInt(req.params.id);
  const { texto, opcoes, correta, dificuldade } = req.body;
  const qs = readJSON(QUESTIONS_FILE);
  const idx = qs.findIndex(q => q.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Pergunta não encontrada." });
  qs[idx] = { id, texto, opcoes, correta, dificuldade };
  writeJSON(QUESTIONS_FILE, qs);
  res.json({ success: true, message: "Pergunta atualizada." });
});

app.delete("/admin/perguntas/:id", (req, res) => {
  const adminEmail = req.query.adminEmail;
  if (!isAdminEmail(adminEmail)) return res.status(403).json({ success: false, message: "Acesso negado." });
  const id = parseInt(req.params.id);
  let qs = readJSON(QUESTIONS_FILE);
  qs = qs.filter(q => q.id !== id);
  writeJSON(QUESTIONS_FILE, qs);
  res.json({ success: true, message: "Pergunta removida." });
});

// ---------- ADMIN: reset mensal ----------
app.post("/admin/reset", (req, res) => {
  const adminEmail = req.body.adminEmail;
  if (!isAdminEmail(adminEmail)) return res.status(403).json({ success: false, message: "Acesso negado." });
  const users = readJSON(USERS_FILE);
  users.forEach(u => { u.ebcoins = 0; u.perguntasRespondidas = []; });
  writeJSON(USERS_FILE, users);
  res.json({ success: true, message: "Dados resetados." });
});

// ---------- PEGAR PERGUNTAS PARA ALUNO (3 por dia, sem repetir 30 dias) ----------
app.get("/perguntas/:email", (req, res) => {
  const email = req.params.email;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.email === email);
  if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

  const today = hojeStr();
  // quantas perguntas já respondeu hoje?
  const qtdHoje = (user.perguntasRespondidas || []).filter(r => r.data === today).length;
  if (qtdHoje >= 3) {
    return res.json({ success: false, message: "Você já respondeu suas 3 perguntas de hoje." });
  }

  const allQ = readJSON(QUESTIONS_FILE);
  // IDs respondidas nos últimos 30 dias
  const limite = dateNDaysAgoStr(30);
  const respondidas30 = new Set((user.perguntasRespondidas || [])
    .filter(r => r.data >= limite)
    .map(r => r.id));

  // filtramos perguntas que NÃO estão em respondidas30
  const disponiveis = allQ.filter(q => !respondidas30.has(q.id));
  if (!disponiveis.length) {
    return res.json({ success: false, message: "Sem perguntas disponíveis (todas respondidas nos últimos 30 dias)." });
  }

  // seleciona com preferência por 1 facil,1 media,1 dificil quando possível
  function pickOne(nivel) {
    const list = disponiveis.filter(q => q.dificuldade === nivel);
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }
  const escolhidas = [];
  const levels = ["facil","media","dificil"];
  for (const lvl of levels) {
    const p = pickOne(lvl);
    if (p) escolhidas.push(p);
    if (escolhidas.length === 3) break;
  }
  // se não tiver 3 (ex.: falta médio), completa com aleatórias das disponíveis
  if (escolhidas.length < 3) {
    const restante = disponiveis.filter(q => !escolhidas.some(e => e.id === q.id));
    restante.sort(() => 0.5 - Math.random());
    while (escolhidas.length < 3 && restante.length) escolhidas.push(restante.shift());
  }
  // caso ainda selecione mais do que precisa (se já respondeu 1 ou 2 hoje), só envia a quantidade restante
  const faltam = 3 - qtdHoje;
  const selecionadas = escolhidas.slice(0, faltam);

  // Guardamos numa propriedade temporária "quizReservado" (não definitivo) para evitar colisão
  user.quizReservado = (user.quizReservado || []).concat(selecionadas.map(q => ({ id: q.id, data: today })));
  writeJSON(USERS_FILE, users);

  // Remove resposta correta antes de enviar ao cliente (para não expor)
  const copy = selecionadas.map(q => ({
    id: q.id,
    texto: q.texto,
    opcoes: q.opcoes,
    dificuldade: q.dificuldade
  }));

  res.json({ success: true, perguntas: copy });
});

// ---------- RESPONDER ----------
// Body: { email, respostas: [ { id, resposta } ] }
// compara e atualiza ebcoins e histórico
app.post("/responder", (req, res) => {
  const { email, respostas } = req.body || {};
  if (!email || !respostas) return res.status(400).json({ success: false, message: "Dados incorretos." });

  const users = readJSON(USERS_FILE);
  const qst = readJSON(QUESTIONS_FILE);
  const user = users.find(u => u.email === email);
  if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

  const today = hojeStr();
  // evitar duplicar: só aceitar respostas que estejam no quizReservado (se existir)
  const reservado = (user.quizReservado || []).map(x => x.id);
  // processar cada resposta
  let ganhos = 0;
  for (const r of respostas) {
    const q = qst.find(x => x.id === r.id);
    if (!q) continue;
    // checar se já respondeu essa pergunta hoje
    const ja = (user.perguntasRespondidas || []).some(pr => pr.id === q.id && pr.data === today);
    if (ja) continue; // pular
    // se houve reserva, assure it's allowed (optional). We allow if it was reserved OR not in last 30 days
    // Verifica resposta correta (case-insensitive, trim)
    const respCliente = (r.resposta || "").toString().trim().toLowerCase();
    const respCerta = (q.correta || "").toString().trim().toLowerCase();
    if (respCliente && respCliente === respCerta) {
      if (q.dificuldade === "facil") ganhos += 1;
      else if (q.dificuldade === "media") ganhos += 3;
      else if (q.dificuldade === "dificil") ganhos += 5;
    }
    // registra como respondida hoje
    user.perguntasRespondidas = user.perguntasRespondidas || [];
    user.perguntasRespondidas.push({ id: q.id, data: today });
  }

  user.ebcoins = (user.ebcoins || 0) + ganhos;

  // limpar quizReservado (remover ids respondidas)
  if (user.quizReservado) {
    const idsRespondidasHoje = (user.perguntasRespondidas || []).filter(x => x.data === today).map(x => x.id);
    user.quizReservado = user.quizReservado.filter(x => !idsRespondidasHoje.includes(x.id));
  }

  // Manter apenas histórico dos últimos 60 dias (apenas para desempenho)
  const limite = dateNDaysAgoStr(60);
  user.perguntasRespondidas = (user.perguntasRespondidas || []).filter(p => p.data >= limite);

  writeJSON(USERS_FILE, users);
  return res.json({ success: true, ganhos, totalEbcoins: user.ebcoins });
});

// ---------- HALL DA FAMA ----------
app.get("/hall", (req, res) => {
  const email = req.query.email; // opcional
  const users = readJSON(USERS_FILE);
  const usersSorted = users.slice().sort((a,b) => (b.ebcoins || 0) - (a.ebcoins || 0));
  const top5 = usersSorted.slice(0,5).map(u => ({ nome: u.nome, email: u.email, ebcoins: u.ebcoins || 0 }));

  let posicao = null;
  let meu = null;
  if (email) {
    posicao = usersSorted.findIndex(u => u.email === email) + 1;
    const u = usersSorted.find(u => u.email === email);
    meu = u ? { nome: u.nome, ebcoins: u.ebcoins || 0, posicao } : null;
  }

  res.json({ top5, meu });
});

// ---------- LISTAR PERGUNTAS PÚBLICO (só para admin ou debug) ----------
app.get("/perguntasPublico", (req, res) => {
  const qs = readJSON(QUESTIONS_FILE);
  res.json(qs);
});

// ---------- Iniciar servidor ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));