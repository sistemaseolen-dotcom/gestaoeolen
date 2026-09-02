/* ============================================================
   Controle de Gestão — Pessoas, Equipes e Treinamentos de Segurança
   Aplicação (SPA vanilla JS)
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- Config ---------------- */
  var TIPOS = [
    ["ASO", "documento"],
    ["CNH", "documento"],
    ["CONTRATO", "documento"],
    ["FICHA DE EPI", "documento"],
    ["INTEGRAÇÃO DE SEGURANÇA", "treinamento"],
    ["NR-33 - SEGURANÇA E SAÚDE NO TRABALHO EM ESPAÇOS CONFINADOS", "treinamento"],
    ["NR06", "treinamento"],
    ["NR10", "treinamento"],
    ["NR18 (ANDAIME)", "treinamento"],
    ["NR18 (CADEIRINHA)", "treinamento"],
    ["NR18 (TRABALHO A QUENTE)", "treinamento"],
    ["NR18 - SOLDAGEM E CORTE A QUENTE", "treinamento"],
    ["NR20 - INFLAMÁVEIS E COMBUSTÍVEIS", "treinamento"],
    ["NR35", "treinamento"],
    ["ORDEM DE SERVIÇO (NR01)", "documento"],
    ["PCMSO", "documento"],
    ["PGR", "documento"],
    ["PRIMEIROS SOCORROS", "treinamento"],
    ["RESGATE EM ALTURA - NR35", "treinamento"],
    ["SEGURO", "documento"],
    ["TERMO DE CONSENTIMENTO", "documento"]
  ];
  var STATUS_OPTS = ["ATIVO", "INATIVO"];
  // Cargos que disparam a criação automática dos documentos obrigatórios abaixo. Fixo de propósito:
  // cargos novos criados depois em Administrador → Listas NÃO entram aqui automaticamente — os
  // documentos, nesse caso, só são adicionados manualmente.
  var CARGOS_COM_DOCS_OBRIGATORIOS = ["TEAM LIDER", "MEMBRO", "TÉCNICO", "VISTORIADOR", "CLEAN UP", "AUDITOR DE QUALIDADE"];
  // Cargos que entram nos KPIs/gráficos do Painel. Fixo de propósito, igual ao
  // de cima (mesmo que hoje tenham os mesmos valores — são dois controles
  // independentes): cargos novos criados em Administrador → Listas (ex.:
  // "GERENTE") continuam aparecendo normalmente no cadastro de Pessoas, mas
  // não entram em nenhum gráfico/KPI do Painel.
  var CARGOS_PAINEL = ["TEAM LIDER", "MEMBRO", "TÉCNICO", "VISTORIADOR", "CLEAN UP", "AUDITOR DE QUALIDADE"];
  // Documentos/treinamentos obrigatórios: gerados automaticamente (como pendentes) toda vez
  // que uma pessoa é cadastrada com um dos cargos acima.
  var DOCS_OBRIGATORIOS_CARGO = [
    ["NR35", "treinamento"],
    ["NR10", "treinamento"],
    ["ASO", "documento"],
    ["PGR", "documento"],
    ["PCMSO", "documento"],
    ["PRIMEIROS SOCORROS", "treinamento"],
    ["ORDEM DE SERVIÇO (NR01)", "documento"],
    ["CONTRATO", "documento"],
    ["NR06", "treinamento"],
    ["TERMO DE CONSENTIMENTO", "documento"],
    ["INTEGRAÇÃO DE SEGURANÇA", "treinamento"]
  ];
  var PAGE_SIZE = 40;
  var PAGE_SIZE_TREINO = 50;

  var ICONS = {
    dashboard: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
    pessoas: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    equipes: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a6 6 0 0 0-12 0"/><circle cx="12" cy="9" r="4"/><path d="M22 21a4 4 0 0 0-3-3.87M2 21a4 4 0 0 1 3-3.87M16 3.6a4 4 0 0 1 0 7.8M8 3.6a4 4 0 0 0 0 7.8"/></svg>',
    empresas: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M9 6h.01M9 10h.01M9 14h.01M15 6h.01M15 10h.01M15 14h.01"/></svg>',
    treinamentos: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
    search: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    plus: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    trash: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>',
    paperclip: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.64 18.36a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    upload: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    alert: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg>',
    check: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    chevronRight: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    inbox: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg>',
    file: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z"/><path d="M14 2v6h6"/></svg>',
    download: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    copy: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    logout: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    lock: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    user: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    history: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l4 2"/></svg>',
    edit: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>'
  };

  /* ---------------- State ---------------- */
  var STATE = null;
  var uiState = {
    pessoas: { q: "", status: "", page: 1 },
    equipes: { q: "", status: "", page: 1 },
    empresas: { q: "", status: "", page: 1 },
    treinamentos: { q: "", tipo: "", categoria: "", status: "", regional: "", month: "", page: 1 }
  };

  /* ---------------- Auth / usuários / permissões ---------------- */
  var CURRENT_USER = null;
  var PAGES = [
    { key: "painel", label: "Painel" },
    { key: "pessoas", label: "Pessoas" },
    { key: "equipes", label: "Equipes" },
    { key: "empresas", label: "Empresas" },
    { key: "documentos", label: "Treinamentos/documentos" }
  ];
  var ACTIONS = [
    { key: "ver", label: "Ver" },
    { key: "criar", label: "Criar" },
    { key: "editar", label: "Editar" },
    { key: "excluir", label: "Excluir" }
  ];

  function defaultPermissoes(tudo) {
    var p = {};
    PAGES.forEach(function (pg) {
      p[pg.key] = {};
      ACTIONS.forEach(function (ac) { p[pg.key][ac.key] = !!tudo; });
    });
    return p;
  }

  function isAdmin() { return !!(CURRENT_USER && CURRENT_USER.role === "admin"); }
  function canView(page) {
    if (isAdmin()) return true;
    return !!(CURRENT_USER && CURRENT_USER.permissoes && CURRENT_USER.permissoes[page] && CURRENT_USER.permissoes[page].ver);
  }
  function canDo(page, acao) {
    if (isAdmin()) return true;
    return !!(CURRENT_USER && CURRENT_USER.permissoes && CURRENT_USER.permissoes[page] && CURRENT_USER.permissoes[page][acao]);
  }
  function firstAllowedRoute() {
    if (canView("painel")) return "treinamentos";
    if (canView("pessoas")) return "pessoas";
    if (canView("equipes")) return "equipes";
    if (canView("empresas")) return "empresas";
    return null;
  }

  /* ---------------- Listas configuráveis (editáveis em Administrador → Listas) ---------------- */
  var LISTAS_META = [
    { key: "cargo", label: "Cargo (pessoas)", defaults: ["TEAM LIDER", "MEMBRO", "TÉCNICO", "VISTORIADOR", "CLEAN UP", "AUDITOR DE QUALIDADE"] },
    { key: "tipoPessoa", label: "Tipo de pessoa", defaults: ["CLT", "PJ", "JOVEM APRENDIZ", "ESTAGIÁRIO"] },
    { key: "statusPessoa", label: "Status (pessoas)", defaults: ["ATIVO", "INATIVO", "BLOQUEADO", "CRESCIMENTO", "FÉRIAS"] },
    { key: "projeto", label: "Projeto", defaults: ["HUAWEI", "ERICSSON", "NOKIA", "TELEFONICA", "NG"] }
  ];
  function listaMeta(key) {
    for (var i = 0; i < LISTAS_META.length; i++) if (LISTAS_META[i].key === key) return LISTAS_META[i];
    return null;
  }
  function ensureListasSeed() {
    STATE.listas = STATE.listas || {};
    LISTAS_META.forEach(function (m) {
      if (!STATE.listas[m.key] || !STATE.listas[m.key].length) STATE.listas[m.key] = m.defaults.slice();
    });
  }
  function listaOptions(key) {
    ensureListasSeed();
    return STATE.listas[key] || [];
  }

  /* ---------------- Auditoria ----------------
     Auditoria (diff de campos por registro) agora é gravada inteiramente no
     servidor (ver src/lib/audit.ts), a partir do before/after de cada rota.
     O cliente só CONSOME o histórico já pronto (campoLabel etc. vêm prontos
     do servidor) via GET /api/audit-log — não recomputa nem grava nada
     localmente. O painel "Histórico de alterações" nas telas de detalhe
     continua existindo, carregado sob demanda (ver loadHistoryPanel).

     Além do histórico completo, cada tela de detalhe também mostra, logo
     abaixo do valor de cada campo, quem fez a última alteração ali (ex.:
     "Alterado por Diego Nunes em 02/09/2026 17:30") — igual ao que existia
     na versão antiga (Claude Artifact). Mecânica: os elementos de campo
     levam um <span data-field-note="campo_snake_case"> vazio (ver
     detailItem/fieldNoteHtml); quando loadHistoryPanel busca o histórico do
     registro (já busca tudo mesmo assim, pro painel de baixo), ele também
     pega a alteração mais recente de cada `campo` e preenche o span
     correspondente — sem nenhuma requisição extra. */
  function mapAuditRow(a) {
    return {
      ts: a.ts, acao: a.acao, campo: a.campo, campoLabel: a.campo_label,
      de: a.de, para: a.para, usuarioNome: a.usuario_nome, entidade: a.entidade,
      entidadeId: a.entidade_id, entidadeLabel: a.entidade_label
    };
  }
  function historyRowHtml(a) {
    var quando = fmtDateHoraBR(a.ts);
    if (a.acao === "criar" && !a.campo) return '<div class="history-row"><span class="history-badge criar">Criado</span><span class="history-text">por <strong>' + esc(a.usuarioNome) + "</strong> em " + quando + "</span></div>";
    if (a.acao === "excluir") return '<div class="history-row"><span class="history-badge excluir">Excluído</span><span class="history-text">por <strong>' + esc(a.usuarioNome) + "</strong> em " + quando + "</span></div>";
    return '<div class="history-row"><span class="history-badge ' + (a.acao === "criar" ? "criar" : "editar") + '">' + (a.acao === "criar" ? "Criado" : "Editado") + '</span><span class="history-text"><strong>' + esc(a.campoLabel || a.campo) + "</strong> alterado por <strong>" + esc(a.usuarioNome) + "</strong> em " + quando +
      ' — de "<em>' + esc(a.de || "—") + '</em>" para "<em>' + esc(a.para || "—") + '</em>"</span></div>';
  }
  function historyPanelHtml(entidade, entidadeId) {
    var panelId = "history-panel-" + entidade + "-" + entidadeId;
    return '<div class="panel" id="' + panelId + '"><div class="panel-head"><h3>Histórico de alterações</h3></div>' +
      '<div class="panel-body pad"><div class="hint">Carregando…</div></div></div>';
  }
  // Busca o histórico do registro sob demanda e injeta no painel — chamado
  // logo depois que a tela de detalhe monta seu HTML (historyPanelHtml só
  // desenha o placeholder "Carregando…").
  function loadHistoryPanel(entidade, entidadeId) {
    apiFetch("/api/audit-log?entidade=" + encodeURIComponent(entidade) + "&entidadeId=" + encodeURIComponent(entidadeId) + "&pageSize=100")
      .then(function (data) {
        var panel = document.getElementById("history-panel-" + entidade + "-" + entidadeId);
        if (!panel) return;
        var items = ((data && data.rows) || []).map(mapAuditRow);
        var body = items.length
          ? '<div class="history-list">' + items.map(historyRowHtml).join("") + "</div>"
          : '<div class="hint">Nenhuma alteração registrada ainda.</div>';
        var bodyEl = panel.querySelector(".panel-body");
        if (bodyEl) bodyEl.innerHTML = body;
        if (items.length) {
          var head = panel.querySelector(".panel-head");
          if (head && !head.querySelector(".hint")) {
            var span = document.createElement("span");
            span.className = "hint";
            span.textContent = items.length + " registro" + (items.length !== 1 ? "s" : "");
            head.appendChild(span);
          }
        }
        // "Alterado por X em Y" abaixo de cada campo: os itens já vêm do mais
        // recente pro mais antigo, então a primeira ocorrência de cada
        // `campo` é a última alteração dele. `panel.parentElement` é o mesmo
        // container (main) onde os campos com data-field-note foram
        // desenhados — escopar nele evita atualizar campos de outra tela caso
        // o usuário já tenha navegado pra outro registro antes desta busca
        // terminar (o `if (!panel) return;` acima já cobre o caso do próprio
        // painel de histórico ter sumido).
        var lastByField = {};
        items.forEach(function (a) {
          if (a.campo && !lastByField[a.campo]) lastByField[a.campo] = a;
        });
        $all("[data-field-note]", panel.parentElement || document).forEach(function (el) {
          var a = lastByField[el.getAttribute("data-field-note")];
          if (!a) { el.textContent = ""; return; }
          var labelPrefix = el.getAttribute("data-field-note-label");
          el.textContent = (labelPrefix ? labelPrefix + ": " : "") + "Alterado por " + a.usuarioNome + " em " + fmtDateHoraBR(a.ts);
        });
      })
      .catch(function () { /* histórico é um extra — falha silenciosa não deve travar a tela */ });
  }
  // <span> vazio que loadHistoryPanel preenche com "Alterado por X em Y"
  // assim que o histórico do registro chega. `label`, quando passado, prefixa
  // a nota (usado nos campos do cabeçalho, que não têm um rótulo ao lado como
  // os de detailItem têm).
  function fieldNoteHtml(campo, label) {
    return '<span class="field-note" data-field-note="' + esc(campo) + '"' + (label ? ' data-field-note-label="' + esc(label) + '"' : "") + "></span>";
  }

  /* ---------------- Utils ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(v) {
    if (v === null || v === undefined) return "";
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function normalize(v) { return (v === null || v === undefined ? "" : String(v)).toLowerCase(); }
  function fmtDateBR(iso) {
    if (!iso) return "—";
    var p = iso.split("-");
    if (p.length !== 3) return iso;
    return p[2] + "/" + p[1] + "/" + p[0];
  }
  function fmtDateHoraBR(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function todayISO() {
    return todaySP();
  }
  function fmtMoney(v) {
    v = Number(v || 0);
    if (!v) return "—";
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function byId(list, id) {
    id = Number(id);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function todaySP() {
    // "Hoje" é fixado em UTC, não no relógio/fuso do navegador de quem está
    // olhando — assim Vencidos/A vencer mostram o mesmo número pra qualquer
    // pessoa, em qualquer dispositivo, em vez de variar com o fuso local de
    // cada um ou virar um dia antes/depois dependendo de onde a página é
    // aberta.
    var d = new Date();
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }
  function daysUntil(iso) {
    var d = new Date(iso + "T00:00:00Z");
    var t = new Date(todaySP() + "T00:00:00Z");
    return Math.round((d - t) / 86400000);
  }
  function trainingStatus(t) {
    if (t.vencimento) {
      var diff = daysUntil(t.vencimento);
      if (diff < 0) return { code: "VENCIDO", label: "Vencido", cls: "danger" };
      if (diff <= 30) return { code: "A_VENCER", label: "A vencer (30 dias)", cls: "warn" };
      if (diff <= 60) return { code: "A_VENCER_60", label: "A vencer (60 dias)", cls: "info" };
      return { code: "VALIDO", label: "Válido", cls: "ok" };
    }
    var s = (t.situacaoOriginal || "").toUpperCase();
    if (s === "VALIDO") return { code: "VALIDO", label: "Válido", cls: "ok" };
    if (s === "VENCIDO") return { code: "VENCIDO", label: "Vencido", cls: "danger" };
    if (s === "RENOVAR") return { code: "A_VENCER", label: "Renovar", cls: "warn" };
    return { code: "SEM_VENCIMENTO", label: "Sem vencimento", cls: "neutral" };
  }
  function pill(st) {
    return '<span class="pill ' + st.cls + '">' + esc(st.label) + "</span>";
  }
  function statusPillGeneric(status) {
    var cls = "neutral";
    if (status === "ATIVO") cls = "ok";
    else if (status === "BLOQUEADO") cls = "danger";
    else if (status === "FÉRIAS" || status === "CRESCIMENTO") cls = "warn";
    return '<span class="pill ' + cls + '">' + esc(status || "—") + "</span>";
  }
  function distinctStatuses(list) {
    var set = {}, out = [];
    (list || []).forEach(function (x) {
      var v = (x.status || "").trim();
      if (v && !set[v]) { set[v] = true; out.push(v); }
    });
    out.sort(function (a, b) { return a === "ATIVO" ? -1 : b === "ATIVO" ? 1 : a.localeCompare(b); });
    return out;
  }
  function isPessoaAtiva(pessoaId) {
    var p = pessoaId ? byId(STATE.pessoas, pessoaId) : null;
    return !!p && p.status === "ATIVO";
  }
  // Mesma checagem de "pessoa ativa" acima, mas também exige um dos cargos do
  // Painel (CARGOS_PAINEL) — usada só para alimentar os KPIs/gráficos do
  // Painel, nunca para o cadastro de Pessoas em si (que continua mostrando
  // todo mundo, de qualquer cargo).
  function isPessoaAtivaPainel(pessoaId) {
    var p = pessoaId ? byId(STATE.pessoas, pessoaId) : null;
    return !!p && p.status === "ATIVO" && CARGOS_PAINEL.indexOf(cargoNorm(p)) !== -1;
  }
  function activeTreinamentos() {
    return STATE.treinamentos.filter(function (t) { return isPessoaAtivaPainel(t.pessoaId); });
  }
  function isTeamLider(p) { return (p.cargo || "").trim().toUpperCase() === "TEAM LIDER"; }
  function countTeamLideres(onlyAtivo) {
    return STATE.pessoas.filter(function (p) {
      return isTeamLider(p) && (!onlyAtivo || p.status === "ATIVO");
    }).length;
  }
  // Regra do Diego: toda contagem de "equipes" no painel é feita por pessoas
  // cadastradas como TEAM LIDER e com status ATIVO (não pela tabela equipes).
  function teamLideresAtivos() {
    return STATE.pessoas.filter(function (p) { return isTeamLider(p) && p.status === "ATIVO"; });
  }
  function liderName(e) {
    if (e.teamLiderId) {
      var p = byId(STATE.pessoas, e.teamLiderId);
      if (p) return p.nome;
    }
    return e.teamLider || "";
  }
  function empresaTitle(e) {
    return (e.fantasia && e.fantasia.trim()) || (e.nome && e.nome.trim()) || (e.cnpj && "CNPJ " + e.cnpj) || "Empresa sem nome";
  }
  function initials(name) {
    var parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /* ---------------- Toasts ---------------- */
  function toast(msg, kind) {
    var stack = $("#toast-stack");
    var el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  function showTip(evt, title, sub) {
    var tip = document.getElementById("viz-tooltip");
    if (!tip) return;
    tip.textContent = "";
    var strong = document.createElement("div");
    strong.textContent = title || "";
    tip.appendChild(strong);
    if (sub) {
      var subEl = document.createElement("div");
      subEl.className = "sub";
      subEl.textContent = sub;
      tip.appendChild(subEl);
    }
    positionTip(evt);
    tip.classList.add("show");
  }
  function positionTip(evt) {
    var tip = document.getElementById("viz-tooltip");
    if (!tip) return;
    var x = evt && evt.clientX, y = evt && evt.clientY;
    if (!x && !y && evt && evt.target && evt.target.getBoundingClientRect) {
      var r = evt.target.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top;
    }
    tip.style.left = (x || 0) + "px";
    tip.style.top = (y || 0) + "px";
  }
  function hideTip() {
    var tip = document.getElementById("viz-tooltip");
    if (tip) tip.classList.remove("show");
  }
  function bindTooltips(container) {
    $all("[data-tip-title]", container).forEach(function (el) {
      el.addEventListener("pointerenter", function (e) { showTip(e, el.getAttribute("data-tip-title"), el.getAttribute("data-tip-sub")); });
      el.addEventListener("pointermove", positionTip);
      el.addEventListener("pointerleave", hideTip);
      el.addEventListener("focus", function (e) { showTip(e, el.getAttribute("data-tip-title"), el.getAttribute("data-tip-sub")); });
      el.addEventListener("blur", hideTip);
    });
  }

  function setSaveDot(state) {
    var dot = $("#save-dot");
    var label = $("#save-label");
    if (!dot) return;
    dot.className = "save-dot" + (state === "saving" ? " saving" : state === "error" ? " error" : "");
    label.textContent = state === "saving" ? "Salvando…" : state === "error" ? "Erro ao salvar" : "Salvo";
  }

  /* ---------------- API ----------------
     Toda a persistência agora é feita por chamadas REST às rotas em
     src/app/api/**. apiFetch centraliza: header JSON, parse de resposta e
     tratamento uniforme de 401 (sessão expirada — desloga e manda pra tela
     de login com um toast). Chamadores tratam erros != 401 no seu próprio
     .catch (ver handleApiError). */
  function apiFetch(url, opts) {
    opts = opts || {};
    var fetchOpts = { method: opts.method || "GET", credentials: "same-origin" };
    if (opts.body !== undefined) {
      if (opts.isFormData) {
        fetchOpts.body = opts.body; // FormData — o browser define o Content-Type (multipart) sozinho
      } else {
        fetchOpts.headers = { "Content-Type": "application/json" };
        fetchOpts.body = JSON.stringify(opts.body);
      }
    }
    return fetch(url, fetchOpts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && !opts.silentAuth) {
          CURRENT_USER = null;
          render();
          toast("Sessão expirada, faça login novamente.", "error");
        }
        if (!res.ok) {
          var err = new Error((data && data.error) || "Não foi possível completar a ação.");
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }
  function handleApiError(err) {
    if (err && err.status === 401) return; // já tratado (toast + logout) dentro de apiFetch
    toast((err && err.message) || "Não foi possível completar a ação.", "error");
  }
  // "" (input date/select vazio) precisa virar null antes de mandar pro
  // servidor — colunas `date` do Postgres rejeitam string vazia.
  function emptyToNull(v) { return v === "" || v === undefined ? null : v; }

  /* ---------------- Mapeadores API (snake_case) <-> STATE (camelCase) ----------------
     GET /api/state e as respostas de POST/PATCH devolvem as linhas cruas das
     tabelas (colunas snake_case). O restante deste arquivo (telas, formulários,
     gráficos) foi escrito contra os nomes camelCase do app.js original — em
     vez de reescrever cada tela, mapeamos aqui na borda. Bodies enviados ao
     servidor já usam as chaves camelCase que as rotas esperam (pessoaFromBody
     etc. em src/app/api/**), então não é necessário mapear no sentido inverso. */
  function mapPessoaFromApi(row) {
    if (!row) return row;
    return {
      id: row.id, nome: row.nome, cargo: row.cargo, status: row.status, regional: row.regional,
      projeto: row.projeto, operadora: row.operadora, cadastro: row.cadastro, coordenador: row.coordenador,
      tipoPessoa: row.tipo_pessoa, dataAdmissao: row.data_admissao, dataDemissao: row.data_demissao,
      matriculaESocial: row.matricula_esocial, cpf: row.cpf, rg: row.rg, dataNascimento: row.data_nascimento,
      pis: row.pis, cnh: row.cnh, dataValidadeCNH: row.data_validade_cnh, escolaridade: row.escolaridade,
      estadoCivil: row.estado_civil, email: row.email, telefone: row.telefone,
      emailCorporativo: row.email_corporativo, telefoneCorporativo: row.telefone_corporativo,
      cep: row.cep, endereco: row.endereco, numero: row.numero, complemento: row.complemento,
      bairro: row.bairro, municipio: row.municipio, estado: row.estado, mei: row.mei,
      numeroContrato: row.numero_contrato, validadeContrato: row.validade_contrato,
      observacao: row.observacao, empresaId: row.empresa_id, empresaNome: row.empresa_nome,
      valorHora: row.valor_hora, salarioBruto: row.salario_bruto
    };
  }
  function mapEmpresaFromApi(row) {
    if (!row) return row;
    return {
      id: row.id, nome: row.nome, fantasia: row.fantasia, cnpj: row.cnpj, porte: row.porte,
      cidade: row.cidade, uf: row.uf, cep: row.cep, bairro: row.bairro, logradouro: row.logradouro,
      numero: row.numero, telefone: row.telefone, email: row.email, nomeResponsavel: row.nome_responsavel,
      regional: row.regional, cnaePrincipal: row.cnae_principal, cnaeDescricao: row.cnae_descricao,
      pgr: row.pgr, pcmso: row.pcmso, situacaoCadastral: row.situacao_cadastral, status: row.status
    };
  }
  function mapEquipeFromApi(row) {
    if (!row) return row;
    return {
      id: row.id, nome: row.nome, regional: row.regional, projeto: row.projeto, operadora: row.operadora,
      status: row.status, teamLiderId: row.team_lider_id, teamLider: row.team_lider,
      membros: row.membros || []
    };
  }
  function mapTreinamentoFromApi(row) {
    if (!row) return row;
    return {
      id: row.id, pessoaId: row.pessoa_id, pessoaNome: row.pessoa_nome, tipo: row.tipo,
      categoria: row.categoria, situacaoOriginal: row.situacao_original, vencimento: row.vencimento,
      dataEmissao: row.data_emissao, observacao: row.observacao,
      arquivoNome: row.arquivo_nome, arquivoPath: row.arquivo_path
    };
  }
  function mapUsuarioFromApi(row) {
    if (!row) return row;
    return {
      id: row.id, nome: row.nome, email: row.email, role: row.role, ativo: row.ativo,
      permissoes: row.permissoes, mustChangePassword: row.must_change_password,
      ultimoLoginEm: row.ultimo_login_em, criadoEm: row.criado_em, criadoPor: row.criado_por
    };
  }

  function loadState() {
    return apiFetch("/api/state").then(function (data) {
      return {
        pessoas: (data.pessoas || []).map(mapPessoaFromApi),
        empresas: (data.empresas || []).map(mapEmpresaFromApi),
        treinamentos: (data.treinamentos || []).map(mapTreinamentoFromApi),
        equipes: (data.equipes || []).map(mapEquipeFromApi),
        listas: data.listas || {}
      };
    });
  }
  // Recarrega tudo de /api/state — usado depois de ações cujo efeito colateral
  // no servidor não cabe inteiro na resposta do próprio POST/PATCH (ex.: os
  // documentos obrigatórios criados automaticamente ao cadastrar uma pessoa
  // com cargo operacional).
  function refreshState() {
    return loadState().then(function (data) {
      STATE.pessoas = data.pessoas;
      STATE.empresas = data.empresas;
      STATE.treinamentos = data.treinamentos;
      STATE.equipes = data.equipes;
      STATE.listas = data.listas;
      ensureListasSeed();
    });
  }

  /* ---------------- Router ---------------- */
  function currentRoute() {
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    return { view: parts[0] || "treinamentos", id: parts[1] || null };
  }

  function navigate(hash) { location.hash = hash; }

  window.addEventListener("hashchange", render);

  /* ---------------- Layout shell ---------------- */
  function renderShell() {
    var route = currentRoute();
    var navItems = [];
    if (canView("painel")) navItems.push(["treinamentos", "Painel", ICONS.dashboard, activeTreinamentos().length]);
    if (canView("pessoas")) navItems.push(["pessoas", "Pessoas", ICONS.pessoas, STATE.pessoas.length]);
    if (canView("equipes")) navItems.push(["equipes", "Equipes", ICONS.equipes, countTeamLideres(true)]);
    if (canView("empresas")) navItems.push(["empresas", "Empresas", ICONS.empresas, STATE.empresas.length]);
    if (isAdmin()) navItems.push(["admin", "Administrador", ICONS.treinamentos, null]);
    var navHtml = navItems.map(function (it) {
      var active = route.view === it[0];
      return '<button class="nav-item' + (active ? " active" : "") + '" data-nav="' + it[0] + '">' + it[2] +
        "<span>" + it[1] + "</span>" + (it[3] !== null ? '<span class="nav-count">' + it[3] + "</span>" : "") + "</button>";
    }).join("");

    document.getElementById("sidebar-nav").innerHTML = navHtml;
    $all("[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () { navigate("#/" + btn.getAttribute("data-nav")); });
    });
    renderUserRow();
  }

  function renderUserRow() {
    var foot = document.querySelector(".sidebar-foot");
    if (!foot || !CURRENT_USER) return;
    var row = foot.querySelector(".user-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "user-row";
      foot.insertBefore(row, foot.firstChild);
    }
    row.innerHTML =
      '<div class="user-row-info" title="' + esc(CURRENT_USER.email) + '">' +
      '<span class="user-avatar">' + esc(initials(CURRENT_USER.nome)) + "</span>" +
      '<div class="user-row-text"><strong>' + esc(CURRENT_USER.nome) + "</strong><span>" + (isAdmin() ? "Administrador" : "Usuário") + "</span></div></div>" +
      '<button class="btn ghost sm" id="btn-logout" title="Sair">' + ICONS.logout + "</button>";
    $("#btn-logout", row).addEventListener("click", function () {
      apiFetch("/api/auth/logout", { method: "POST" }).catch(function () { /* segue com o logout local mesmo se a chamada falhar */ }).then(function () {
        CURRENT_USER = null;
        location.hash = "";
        render();
      });
    });
  }

  /* ---------------- Autenticação: telas ---------------- */
  function showAuthOverlay(html) {
    var shell = document.getElementById("shell");
    if (shell) shell.style.display = "none";
    var banner = document.getElementById("readonly-banner");
    if (banner) banner.style.display = "none";
    var el = document.getElementById("auth-screen");
    if (!el) {
      el = document.createElement("div");
      el.id = "auth-screen";
      el.className = "auth-screen";
      document.body.insertBefore(el, shell);
    }
    el.innerHTML = html;
    el.style.display = "flex";
  }
  function hideAuthOverlay() {
    var el = document.getElementById("auth-screen");
    if (el) el.style.display = "none";
    var shell = document.getElementById("shell");
    if (shell) shell.style.display = "";
  }
  function authBrandHtml() {
    return '<div class="auth-brand"><div class="brand-mark">CE</div><div><strong>Controle Eolen</strong><span>Pessoas &amp; Segurança</span></div></div>';
  }
  function renderLoginScreen(errorMsg) {
    var html = '<div class="auth-card">' + authBrandHtml() +
      "<h2>Entrar</h2>" +
      (errorMsg ? '<div class="auth-error">' + esc(errorMsg) + "</div>" : "") +
      '<form id="login-form">' +
      '<div class="field"><label>E-mail</label><input type="email" name="email" autocomplete="username" required></div>' +
      '<div class="field"><label>Senha</label><input type="password" name="senha" autocomplete="current-password" required></div>' +
      '<button type="submit" class="btn primary" style="width:100%;margin-top:8px;">Entrar</button>' +
      "</form></div>";
    showAuthOverlay(html);
    var emailInput = $('#login-form input[name="email"]');
    if (emailInput) emailInput.focus();
    var submitBtn = $('#login-form button[type="submit"]');
    $("#login-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      var email = (fd.get("email") || "").toString().trim();
      var senha = (fd.get("senha") || "").toString();
      if (submitBtn) submitBtn.disabled = true;
      apiFetch("/api/auth/login", { method: "POST", body: { email: email, senha: senha }, silentAuth: true })
        .then(function (data) {
          CURRENT_USER = mapUsuarioFromApi(data.usuario);
          return loadState();
        })
        .then(function (data) {
          STATE = data;
          ensureListasSeed();
          render();
        })
        .catch(function (err) {
          renderLoginScreen((err && err.message) || "E-mail ou senha inválidos.");
        });
    });
  }
  function renderTrocarSenhaScreen() {
    var html = '<div class="auth-card">' + authBrandHtml() +
      "<h2>Defina sua nova senha</h2>" +
      '<div class="hint" style="margin-bottom:12px;">Por segurança, você precisa trocar a senha padrão antes de continuar.</div>' +
      '<form id="trocar-senha-form">' +
      '<div class="field"><label>Nova senha</label><input type="password" name="nova" autocomplete="new-password" minlength="6" required></div>' +
      '<div class="field"><label>Confirmar nova senha</label><input type="password" name="confirmar" autocomplete="new-password" minlength="6" required></div>' +
      '<button type="submit" class="btn primary" style="width:100%;margin-top:8px;">Salvar e continuar</button>' +
      "</form></div>";
    showAuthOverlay(html);
    var novaInput = $('#trocar-senha-form input[name="nova"]');
    if (novaInput) novaInput.focus();
    $("#trocar-senha-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      var nova = (fd.get("nova") || "").toString();
      var conf = (fd.get("confirmar") || "").toString();
      if (nova.length < 6) { toast("A senha deve ter pelo menos 6 caracteres.", "error"); return; }
      if (nova !== conf) { toast("As senhas não coincidem.", "error"); return; }
      apiFetch("/api/auth/change-password", { method: "POST", body: { nova: nova, confirmar: conf } })
        .then(function () {
          CURRENT_USER.mustChangePassword = false;
          toast("Senha alterada.", "success");
          render();
        })
        .catch(handleApiError);
    });
  }
  function renderSemPermissao(main) {
    main.innerHTML = '<div class="empty-state" style="padding:60px 20px;text-align:center;">' + ICONS.lock +
      '<h3 style="margin-top:12px;">Sem permissão</h3><p class="hint">Você não tem acesso a esta página. Fale com o administrador se precisar de acesso.</p></div>';
  }

  /* ---------------- Table shell helper ---------------- */
  function tableShell(opts) {
    // opts: {toolbar, headHtml, bodyHtml, count, page, totalPages, onPage, empty}
    var html = '<div class="panel">';
    html += '<div class="table-toolbar">' + opts.toolbar + '<span class="table-count">' + opts.count + " registro" + (opts.count === 1 ? "" : "s") + "</span></div>";
    if (opts.count === 0) {
      html += '<div class="empty-state">' + ICONS.inbox + "<div>" + (opts.empty || "Nenhum registro encontrado.") + "</div></div>";
    } else {
      html += '<div class="table-scroll"><table class="data"><thead><tr>' + opts.headHtml + "</tr></thead><tbody>" + opts.bodyHtml + "</tbody></table></div>";
      if (opts.totalPages > 1) {
        html += '<div class="pagination"><span>Página ' + opts.page + " de " + opts.totalPages + '</span>' +
          '<button class="btn sm" data-page="prev" ' + (opts.page <= 1 ? "disabled" : "") + '>Anterior</button>' +
          '<button class="btn sm" data-page="next" ' + (opts.page >= opts.totalPages ? "disabled" : "") + '>Próxima</button></div>';
      }
    }
    html += "</div>";
    return html;
  }

  function paginate(list, page, size) {
    var totalPages = Math.max(1, Math.ceil(list.length / size));
    page = Math.min(Math.max(1, page), totalPages);
    var start = (page - 1) * size;
    return { items: list.slice(start, start + size), page: page, totalPages: totalPages };
  }

  function withFocusPreserved(fn) {
    var active = document.activeElement;
    var id = active && active.id;
    var selStart = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
    var selEnd = active && typeof active.selectionEnd === "number" ? active.selectionEnd : null;
    fn();
    if (id) {
      var el = document.getElementById(id);
      if (el) {
        el.focus();
        if (selStart !== null && el.setSelectionRange) {
          try { el.setSelectionRange(selStart, selEnd); } catch (e) { /* not a text input */ }
        }
      }
    }
  }
  function bindPagination(container, ui, size, list, rerender) {
    $all("[data-page]", container).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var totalPages = Math.max(1, Math.ceil(list.length / size));
        if (btn.getAttribute("data-page") === "prev") ui.page = Math.max(1, ui.page - 1);
        else ui.page = Math.min(totalPages, ui.page + 1);
        rerender();
      });
    });
  }

  /* ================================================================
     PESSOAS
     ================================================================ */
  function pessoaEquipes(pessoaId) {
    return STATE.equipes.filter(function (e) {
      return e.membros.some(function (m) { return m.pessoaId === pessoaId; });
    });
  }
  function pessoaLiderNome(pessoaId) {
    var eqs = pessoaEquipes(pessoaId);
    var names = eqs.map(function (e) { return liderName(e); }).filter(Boolean);
    names = names.filter(function (n, i) { return names.indexOf(n) === i; });
    return names.join(", ");
  }
  function pessoaCoordenadorNome(pessoaId) {
    var p = pessoaId ? byId(STATE.pessoas, pessoaId) : null;
    return p && p.coordenador ? p.coordenador : "";
  }
  function pessoaTreinamentos(pessoaId) {
    return STATE.treinamentos.filter(function (t) { return t.pessoaId === pessoaId; });
  }

  function renderPessoasList(main) {
    var ui = uiState.pessoas;

    function computeFiltered() {
      var all = STATE.pessoas.slice().sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
      return all.filter(function (p) {
        if (ui.status && p.status !== ui.status) return false;
        if (!ui.q) return true;
        var hay = normalize([p.nome, p.cargo, p.cpf, p.empresaNome, p.regional, p.projeto, p.email].join(" "));
        return hay.indexOf(normalize(ui.q)) !== -1;
      });
    }

    function draw() {
      var filtered = computeFiltered();
      withFocusPreserved(function () { drawInto(filtered); });
    }

    function drawInto(filtered) {
      var pg = paginate(filtered, ui.page, PAGE_SIZE);
      ui.page = pg.page;
      var body = pg.items.map(function (p) {
        var tr = p.status === "ATIVO" ? pessoaTreinamentos(p.id) : [];
        var venc = tr.filter(function (t) { return trainingStatus(t).code === "VENCIDO"; }).length;
        return '<tr data-id="' + p.id + '">' +
          '<td><div class="row-primary">' + esc(p.nome) + '</div><div class="row-secondary">' + esc(p.cargo || "—") + '</div></td>' +
          '<td>' + esc(p.empresaNome || "—") + '</td>' +
          '<td>' + esc(p.regional || "—") + '</td>' +
          '<td>' + esc(p.projeto || "—") + '</td>' +
          '<td>' + (venc ? '<span class="pill danger">' + venc + ' vencido' + (venc > 1 ? "s" : "") + '</span>' : '<span class="hint">—</span>') + '</td>' +
          '<td>' + statusPillGeneric(p.status) + '</td>' +
          "</tr>";
      }).join("");

      var toolbar =
        '<div class="search-wrap">' + ICONS.search + '<input type="text" id="pessoas-q" placeholder="Buscar por nome, cargo, CPF, empresa…" value="' + esc(ui.q) + '"></div>' +
        '<select class="filter" id="pessoas-status"><option value="">Todos os status</option>' +
        distinctStatuses(STATE.pessoas).map(function (s) { return '<option value="' + esc(s) + '"' + (ui.status === s ? " selected" : "") + '>' + esc(s) + '</option>'; }).join("") +
        "</select>";

      main.innerHTML =
        '<div class="topbar"><div><h1>Pessoas</h1><div class="sub">Cadastro de colaboradores, PJs e técnicos de campo</div></div>' +
        (canDo("pessoas", "criar") ? '<button class="btn primary" id="btn-new-pessoa">' + ICONS.plus + "Nova pessoa</button>" : "") + "</div>" +
        tableShell({
          toolbar: toolbar,
          headHtml: "<th>Nome / Cargo</th><th>Empresa</th><th>Regional</th><th>Projeto</th><th>Treinamentos</th><th>Status</th>",
          bodyHtml: body,
          count: filtered.length,
          page: pg.page,
          totalPages: pg.totalPages,
          empty: "Nenhuma pessoa encontrada com esses filtros."
        });

      if ($("#btn-new-pessoa")) $("#btn-new-pessoa").addEventListener("click", function () { openPessoaForm(null); });
      $("#pessoas-q").addEventListener("input", debounce(function (e) { ui.q = e.target.value; ui.page = 1; draw(); }, 120));
      $("#pessoas-status").addEventListener("change", function (e) { ui.status = e.target.value; ui.page = 1; draw(); });
      $all("tbody tr", main).forEach(function (row) {
        row.addEventListener("click", function () { navigate("#/pessoas/" + row.getAttribute("data-id")); });
      });
      bindPagination(main, ui, PAGE_SIZE, filtered, draw);
    }
    draw();
  }

  function renderPessoaDetail(main, id) {
    var p = byId(STATE.pessoas, id);
    if (!p) { navigate("#/pessoas"); return; }
    var eqs = pessoaEquipes(p.id);
    var trs = pessoaTreinamentos(p.id).slice().sort(function (a, b) {
      var da = a.vencimento || "9999", db = b.vencimento || "9999";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    var empresa = p.empresaId ? byId(STATE.empresas, p.empresaId) : null;

    main.innerHTML =
      '<div class="topbar">' +
      '<div><button class="link-btn" id="back-btn">← Pessoas</button><h1 style="margin-top:6px;">' + esc(p.nome) + "</h1>" +
      '<div class="sub">' + esc(p.cargo || "—") + " · " + esc(p.regional || "—") + " · " + statusPillGeneric(p.status) + "</div>" +
      '<div class="header-field-notes">' + fieldNoteHtml("nome", "Nome") + fieldNoteHtml("cargo", "Cargo") + fieldNoteHtml("regional", "Regional") + fieldNoteHtml("status", "Status") + "</div>" +
      "</div>" +
      '<div style="display:flex;gap:8px;">' +
      (canDo("pessoas", "editar") ? '<button class="btn" id="btn-edit-pessoa">Editar</button>' : "") +
      (canDo("pessoas", "excluir") ? '<button class="btn danger" id="btn-del-pessoa">' + ICONS.trash + "Excluir</button>" : "") +
      "</div>" +
      "</div>" +
      '<div class="panel"><div class="panel-head"><h3>Dados gerais</h3></div><div class="panel-body pad"><div class="detail-grid">' +
      detailItem("CPF", p.cpf, "cpf") + detailItem("RG", p.rg, "rg") + detailItem("Data de nascimento", fmtDateBR(p.dataNascimento), "data_nascimento") +
      detailItem("Empresa", empresa ? empresaTitle(empresa) : (p.empresaNome || "—"), "empresa_id") + detailItem("Tipo", p.tipoPessoa, "tipo_pessoa") + detailItem("Cadastro/Operadora origem", p.cadastro, "cadastro") +
      detailItem("Projeto", p.projeto, "projeto") + detailItem("Operadora", p.operadora, "operadora") + detailItem("Coordenador", p.coordenador, "coordenador") +
      detailItem("Admissão", fmtDateBR(p.dataAdmissao), "data_admissao") + detailItem("Desligamento", fmtDateBR(p.dataDemissao), "data_demissao") + detailItem("Matrícula eSocial", p.matriculaESocial, "matricula_esocial") +
      "</div></div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Contato</h3></div><div class="panel-body pad"><div class="detail-grid">' +
      detailItem("E-mail", p.email, "email") + detailItem("Telefone", p.telefone, "telefone") + detailItem("E-mail corporativo", p.emailCorporativo, "email_corporativo") + detailItem("Telefone corporativo", p.telefoneCorporativo, "telefone_corporativo") +
      detailItem("Endereço", [p.endereco, p.numero].filter(Boolean).join(", "), "endereco") + detailItem("Bairro / Cidade", [p.bairro, p.municipio, p.estado].filter(Boolean).join(" / "), "bairro") +
      "</div></div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Contrato</h3></div><div class="panel-body pad"><div class="detail-grid">' +
      detailItem("MEI", p.mei, "mei") + detailItem("Nº contrato", p.numeroContrato, "numero_contrato") + detailItem("Validade contrato", fmtDateBR(p.validadeContrato), "validade_contrato") +
      detailItem("Valor hora", fmtMoney(p.valorHora), "valor_hora") + detailItem("Salário bruto", fmtMoney(p.salarioBruto), "salario_bruto") + detailItem("CNH", p.cnh + (p.dataValidadeCNH ? " · venc. " + fmtDateBR(p.dataValidadeCNH) : ""), "cnh") +
      "</div>" + (p.observacao ? '<div style="margin-top:12px;" class="detail-item"><span class="k">Observação</span><span class="v">' + esc(p.observacao) + "</span>" + fieldNoteHtml("observacao") + "</div>" : "") + "</div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Equipes</h3></div><div class="panel-body pad">' +
      (eqs.length ? eqs.map(function (e) {
        return '<div class="member-row" data-eq="' + e.id + '" style="cursor:pointer"><div class="avatar-dot">' + esc(initials(e.nome)) + '</div><div class="info"><div class="name">' + esc(e.nome) + '</div><div class="role">Líder: ' + esc(liderName(e) || "—") + "</div></div>" + statusPillGeneric(e.status) + "</div>";
      }).join("") : '<div class="hint">Esta pessoa não está em nenhuma equipe.</div>') +
      "</div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Treinamentos e documentos</h3>' + (canDo("documentos", "criar") ? '<button class="btn sm primary" id="btn-new-treino">' + ICONS.plus + "Adicionar</button>" : "") + '</div><div class="panel-body">' +
      (trs.length ? '<div class="table-scroll"><table class="data"><thead><tr><th>Item</th><th>Categoria</th><th>Vencimento</th><th>Status</th><th>Anexo</th><th>Ações</th></tr></thead><tbody>' +
        trs.map(function (t) {
          var st = trainingStatus(t);
          return '<tr data-tr="' + t.id + '"><td class="row-primary">' + esc(t.tipo) + '</td><td><span class="tag">' + esc(t.categoria) + '</span></td><td class="mono">' + fmtDateBR(t.vencimento) + '</td><td>' + pill(st) + '</td><td>' + (t.arquivoPath ? ICONS.paperclip : "—") + '</td><td class="row-actions">' +
            (canDo("documentos", "editar") ? '<button class="btn ghost sm" title="Editar" data-tr-edit="' + t.id + '">' + ICONS.edit + '</button><button class="btn ghost sm" title="Anexar arquivo" data-tr-attach="' + t.id + '">' + ICONS.paperclip + "</button>" : "") +
            "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<div class="empty-state" style="padding:20px;">Nenhum treinamento ou documento registrado.</div>') +
      "</div></div>" +
      '<input type="file" id="tr-quick-attach-input" style="display:none">' +
      historyPanelHtml("pessoa", p.id);
    loadHistoryPanel("pessoa", p.id);

    $("#back-btn").addEventListener("click", function () { navigate("#/pessoas"); });
    if ($("#btn-edit-pessoa")) $("#btn-edit-pessoa").addEventListener("click", function () { openPessoaForm(p); });
    if ($("#btn-del-pessoa")) $("#btn-del-pessoa").addEventListener("click", function () { confirmDelete("pessoa", p.id, p.nome); });
    if ($("#btn-new-treino")) $("#btn-new-treino").addEventListener("click", function () { openAddTreinamentosPicker(p); });
    $all("[data-eq]", main).forEach(function (r) { r.addEventListener("click", function () { navigate("#/equipes/" + r.getAttribute("data-eq")); }); });
    $all("[data-tr]", main).forEach(function (r) { r.addEventListener("click", function (ev) { if (ev.target.closest("button")) return; navigate("#/treinamentos/" + r.getAttribute("data-tr")); }); });
    $all("[data-tr-edit]", main).forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var tr = byId(STATE.treinamentos, btn.getAttribute("data-tr-edit"));
        if (tr) openTreinamentoForm(tr, null);
      });
    });
    var quickAttachInput = $("#tr-quick-attach-input", main);
    var quickAttachTargetId = null;
    $all("[data-tr-attach]", main).forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (!canDo("documentos", "editar")) { toast("Você não tem permissão para isso.", "error"); return; }
        quickAttachTargetId = btn.getAttribute("data-tr-attach");
        quickAttachInput.value = "";
        quickAttachInput.click();
      });
    });
    if (quickAttachInput) {
      quickAttachInput.addEventListener("change", function () {
        var file = quickAttachInput.files[0];
        if (!file || !quickAttachTargetId) return;
        if (file.size > 5 * 1024 * 1024) { toast("Arquivo muito grande (máx. 5MB).", "error"); return; }
        var tr = byId(STATE.treinamentos, quickAttachTargetId);
        if (!tr) return;
        var fd = new FormData();
        fd.append("file", file);
        apiFetch("/api/treinamentos/" + tr.id + "/arquivo", { method: "POST", body: fd, isFormData: true })
          .then(function (data) {
            var updated = mapTreinamentoFromApi(data);
            var idx = STATE.treinamentos.findIndex(function (x) { return x.id === updated.id; });
            if (idx !== -1) STATE.treinamentos[idx] = updated;
            render();
            toast("Anexo adicionado.", "success");
          })
          .catch(handleApiError);
      });
    }
  }

  // "+ Adicionar" em Treinamentos e documentos: em vez de abrir o formulário
  // detalhado de um item por vez, mostra a lista de itens padrão que essa
  // pessoa ainda não tem, com checkbox pra marcar vários de uma vez. Cada um
  // marcado entra como pendente (sem vencimento/anexo ainda) — o usuário edita
  // um a um depois, quando quiser preencher os detalhes ou anexar arquivo.
  function openAddTreinamentosPicker(p) {
    var existentes = {};
    pessoaTreinamentos(p.id).forEach(function (t) { existentes[(t.tipo || "").trim().toUpperCase()] = true; });
    var disponiveis = TIPOS.filter(function (t) { return !existentes[t[0].toUpperCase()]; });

    var listHtml = disponiveis.length
      ? '<div style="max-height:360px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-md);">' +
        '<table class="data"><thead><tr><th style="width:36px;"><input type="checkbox" id="tr-picker-all"></th><th>Item</th><th>Categoria</th></tr></thead><tbody>' +
        disponiveis.map(function (t, i) {
          return '<tr><td><input type="checkbox" class="tr-picker-item" value="' + i + '"></td><td class="row-primary">' + esc(t[0]) + '</td><td><span class="tag">' + esc(t[1]) + '</span></td></tr>';
        }).join("") + "</tbody></table></div>"
      : '<div class="hint">Esta pessoa já tem todos os itens da lista padrão. Use "Item personalizado" abaixo para adicionar outro.</div>';

    var html =
      '<div class="modal-box" style="width:min(560px, 92vw);">' +
      "<h3>Adicionar treinamentos/documentos</h3>" +
      "<p>Selecione os itens que deseja adicionar para <strong>" + esc(p.nome) + "</strong>. Eles entram como pendentes — depois é só editar cada um (vencimento, anexo etc.) individualmente.</p>" +
      listHtml +
      '<div class="modal-actions" style="justify-content:space-between;align-items:center;">' +
      '<button type="button" class="link-btn" id="tr-picker-custom">+ Item personalizado…</button>' +
      '<div style="display:flex;gap:8px;"><button type="button" class="btn" id="modal-cancel">Cancelar</button>' +
      (disponiveis.length ? '<button type="button" class="btn primary" id="tr-picker-save">' + ICONS.check + "Adicionar</button>" : "") +
      "</div></div></div>";

    openModal(html);
    var allCb = $("#tr-picker-all");
    if (allCb) {
      allCb.addEventListener("change", function () {
        $all(".tr-picker-item").forEach(function (cb) { cb.checked = allCb.checked; });
      });
    }
    $("#modal-cancel").addEventListener("click", closeModal);
    $("#tr-picker-custom").addEventListener("click", function () {
      closeModal();
      openTreinamentoForm(null, p.id);
    });
    if ($("#tr-picker-save")) {
      $("#tr-picker-save").addEventListener("click", function () {
        if (!canDo("documentos", "criar")) { toast("Você não tem permissão para isso.", "error"); return; }
        var selecionados = $all(".tr-picker-item:checked").map(function (cb) { return disponiveis[Number(cb.value)]; });
        if (!selecionados.length) { toast("Selecione ao menos um item.", "error"); return; }
        Promise.all(selecionados.map(function (d) {
          return apiFetch("/api/treinamentos", {
            method: "POST",
            body: { pessoaId: p.id, tipo: d[0], categoria: d[1], vencimento: null, dataEmissao: null, situacaoOriginal: "", observacao: "" }
          }).then(function (data) { STATE.treinamentos.push(mapTreinamentoFromApi(data)); });
        })).then(function () {
          closeModal();
          render();
          renderShellCounts();
          toast(selecionados.length === 1 ? "1 item adicionado." : selecionados.length + " itens adicionados.", "success");
        }).catch(handleApiError);
      });
    }
  }

  // `campo` (opcional): nome da coluna no banco (snake_case, igual ao
  // `campo` gravado em audit_log — ver FIELD_LABELS em src/lib/audit.ts).
  // Quando informado, mostra "Alterado por X em Y" abaixo do valor assim que
  // loadHistoryPanel busca o histórico do registro.
  function detailItem(label, value, campo) {
    return '<div class="detail-item"><span class="k">' + esc(label) + '</span><span class="v">' + esc(value || "—") + "</span>" + (campo ? fieldNoteHtml(campo) : "") + "</div>";
  }

  function openPessoaForm(p) {
    var isNew = !p;
    var empresasOpts = STATE.empresas.slice().sort(function (a, b) { return empresaTitle(a).localeCompare(empresaTitle(b)); })
      .map(function (e) { return '<option value="' + e.id + '"' + (p && p.empresaId === e.id ? " selected" : "") + '>' + esc(empresaTitle(e)) + "</option>"; }).join("");

    var html =
      '<div class="drawer-head"><div><h2>' + (isNew ? "Nova pessoa" : "Editar pessoa") + '</h2><div class="sub">Cadastro completo do colaborador</div></div>' +
      '<button class="btn ghost sm" id="drawer-close">' + ICONS.close + "</button></div>" +
      '<form class="drawer-body" id="pessoa-form">' +
      '<div class="section-tabs">' +
      '<button type="button" class="section-tab active" data-tab="geral">Geral</button>' +
      '<button type="button" class="section-tab" data-tab="doc">Documentos</button>' +
      '<button type="button" class="section-tab" data-tab="contato">Contato</button>' +
      '<button type="button" class="section-tab" data-tab="contrato">Contrato</button>' +
      "</div>" +
      '<div class="tab-pane active" data-pane="geral"><div class="field-grid">' +
      field("Nome completo *", "nome", "text", p, { required: true, span2: true }) +
      cargoSelectField(p) + selectField("Status *", "status", listaOptions("statusPessoa"), p ? p.status : "ATIVO", { required: true }) +
      field("Regional", "regional", "text", p) + selectField("Projeto", "projeto", listaOptions("projeto"), p ? p.projeto : "", { allowEmpty: true }) +
      field("Operadora", "operadora", "text", p) + field("Cadastro (origem)", "cadastro", "text", p) +
      field("Coordenador", "coordenador", "text", p) + selectField("Tipo de pessoa", "tipoPessoa", listaOptions("tipoPessoa"), p ? p.tipoPessoa : "", { allowEmpty: true }) +
      '<div class="field"><label>Empresa</label><select name="empresaId"><option value="">— nenhuma —</option>' + empresasOpts + "</select></div>" +
      field("Data de admissão", "dataAdmissao", "date", p) + field("Data de desligamento", "dataDemissao", "date", p) +
      field("Matrícula eSocial", "matriculaESocial", "text", p) +
      '<div class="field span2"><label>Observação</label><textarea name="observacao">' + esc(p ? p.observacao : "") + "</textarea></div>" +
      "</div></div>" +
      '<div class="tab-pane" data-pane="doc"><div class="field-grid">' +
      field("CPF *", "cpf", "text", p) + field("RG", "rg", "text", p) +
      field("Data de nascimento", "dataNascimento", "date", p) + field("PIS", "pis", "text", p) +
      field("CNH", "cnh", "text", p) + field("Validade CNH", "dataValidadeCNH", "date", p) +
      field("Escolaridade", "escolaridade", "text", p) + field("Estado civil", "estadoCivil", "text", p) +
      "</div></div>" +
      '<div class="tab-pane" data-pane="contato"><div class="field-grid">' +
      field("E-mail", "email", "email", p) + field("Telefone", "telefone", "text", p) +
      field("E-mail corporativo", "emailCorporativo", "email", p) + field("Telefone corporativo", "telefoneCorporativo", "text", p) +
      field("CEP", "cep", "text", p) + field("Endereço", "endereco", "text", p) +
      field("Número", "numero", "text", p) + field("Complemento", "complemento", "text", p) +
      field("Bairro", "bairro", "text", p) + field("Município", "municipio", "text", p) + field("Estado", "estado", "text", p) +
      "</div></div>" +
      '<div class="tab-pane" data-pane="contrato"><div class="field-grid">' +
      field("MEI", "mei", "text", p) + field("Nº contrato", "numeroContrato", "text", p) +
      field("Validade do contrato", "validadeContrato", "date", p) + field("Valor hora (R$)", "valorHora", "number", p) +
      field("Salário bruto (R$)", "salarioBruto", "number", p) +
      "</div></div>" +
      "</form>" +
      '<div class="drawer-foot"><span></span><div style="display:flex;gap:8px;"><button type="button" class="btn" id="drawer-cancel">Cancelar</button><button type="submit" form="pessoa-form" class="btn primary">' + ICONS.check + "Salvar</button></div></div>";

    openDrawer(html);
    setupTabs();
    $("#pessoa-form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!canDo("pessoas", isNew ? "criar" : "editar")) { toast("Você não tem permissão para isso.", "error"); return; }
      var fd = new FormData(e.target);
      var body = {};
      var camposEditaveis = ["nome", "cargo", "status", "regional", "projeto", "operadora", "cadastro", "coordenador", "tipoPessoa",
        "dataAdmissao", "dataDemissao", "matriculaESocial", "cpf", "rg", "dataNascimento", "pis", "cnh", "dataValidadeCNH",
        "escolaridade", "estadoCivil", "email", "telefone", "emailCorporativo", "telefoneCorporativo", "cep", "endereco",
        "numero", "complemento", "bairro", "municipio", "estado", "mei", "numeroContrato", "validadeContrato", "observacao"];
      var camposData = ["dataAdmissao", "dataDemissao", "dataNascimento", "dataValidadeCNH", "validadeContrato"];
      camposEditaveis.forEach(function (k) { body[k] = (fd.get(k) || "").toString().trim(); });
      camposData.forEach(function (k) { body[k] = emptyToNull(body[k]); });
      body.valorHora = Number(fd.get("valorHora") || 0);
      body.salarioBruto = Number(fd.get("salarioBruto") || 0);
      var empId = fd.get("empresaId");
      body.empresaId = empId ? Number(empId) : null;
      if (!body.nome) { toast("Informe o nome da pessoa.", "error"); activateFormTab("geral"); return; }
      if (!body.cargo) { toast("Selecione o cargo.", "error"); activateFormTab("geral"); return; }
      if (!body.status) { toast("Selecione o status.", "error"); activateFormTab("geral"); return; }
      if (!body.cpf) { toast("Informe o CPF.", "error"); activateFormTab("doc"); return; }
      var criouDocsObrigatorios = isNew && CARGOS_COM_DOCS_OBRIGATORIOS.indexOf(body.cargo) !== -1;

      var req = isNew
        ? apiFetch("/api/pessoas", { method: "POST", body: body })
        : apiFetch("/api/pessoas/" + p.id, { method: "PATCH", body: body });

      req.then(function (data) {
        var rec = mapPessoaFromApi(data);
        var afterSave = function () {
          closeDrawer();
          render();
          renderShellCounts();
          toast(isNew ? (criouDocsObrigatorios ? "Pessoa cadastrada. " + DOCS_OBRIGATORIOS_CARGO.length + " documentos obrigatórios do cargo criados como pendentes." : "Pessoa cadastrada.") : "Pessoa atualizada.", "success");
          navigate("#/pessoas/" + rec.id);
        };
        if (isNew) {
          if (criouDocsObrigatorios) {
            // O servidor já criou os documentos obrigatórios pendentes junto
            // com a pessoa — recarrega o estado pra trazê-los pro STATE local.
            refreshState().then(afterSave);
          } else {
            STATE.pessoas.push(rec);
            afterSave();
          }
        } else {
          var idx = STATE.pessoas.findIndex(function (x) { return x.id === rec.id; });
          if (idx !== -1) STATE.pessoas[idx] = rec;
          afterSave();
        }
      }).catch(handleApiError);
    });
    $("#drawer-close").addEventListener("click", closeDrawer);
    $("#drawer-cancel").addEventListener("click", closeDrawer);
  }

  /* ================================================================
     EQUIPES
     ================================================================ */
  function renderEquipesList(main) {
    var ui = uiState.equipes;

    function computeFiltered() {
      var all = STATE.equipes.slice().sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
      return all.filter(function (e) {
        if (ui.status && e.status !== ui.status) return false;
        if (!ui.q) return true;
        var hay = normalize([e.nome, e.teamLider, liderName(e), e.regional, e.projeto, e.operadora].join(" "));
        return hay.indexOf(normalize(ui.q)) !== -1;
      });
    }

    function draw() {
      var filtered = computeFiltered();
      withFocusPreserved(function () { drawInto(filtered); });
    }

    function drawInto(filtered) {
      var pg = paginate(filtered, ui.page, PAGE_SIZE);
      ui.page = pg.page;
      var body = pg.items.map(function (e) {
        return '<tr data-id="' + e.id + '">' +
          '<td><div class="row-primary">' + esc(e.nome) + '</div><div class="row-secondary">Líder: ' + esc(liderName(e) || "—") + '</div></td>' +
          '<td>' + esc(e.regional || "—") + '</td><td>' + esc(e.projeto || "—") + '</td><td>' + esc(e.operadora || "—") + '</td>' +
          '<td class="num">' + e.membros.length + '</td><td>' + statusPillGeneric(e.status) + "</td></tr>";
      }).join("");
      var toolbar =
        '<div class="search-wrap">' + ICONS.search + '<input type="text" id="equipes-q" placeholder="Buscar por equipe, líder, projeto…" value="' + esc(ui.q) + '"></div>' +
        '<select class="filter" id="equipes-status"><option value="">Todos os status</option>' +
        distinctStatuses(STATE.equipes).map(function (s) { return '<option value="' + esc(s) + '"' + (ui.status === s ? " selected" : "") + '>' + esc(s) + "</option>"; }).join("") + "</select>";

      main.innerHTML =
        '<div class="topbar"><div><h1>Equipes</h1><div class="sub">Times de campo, líderes e composição</div></div>' +
        (canDo("equipes", "criar") ? '<button class="btn primary" id="btn-new-equipe">' + ICONS.plus + "Nova equipe</button>" : "") + "</div>" +
        tableShell({
          toolbar: toolbar,
          headHtml: "<th>Equipe / Líder</th><th>Regional</th><th>Projeto</th><th>Operadora</th><th class=\"num\">Membros</th><th>Status</th>",
          bodyHtml: body, count: filtered.length, page: pg.page, totalPages: pg.totalPages,
          empty: "Nenhuma equipe encontrada."
        });

      if ($("#btn-new-equipe")) $("#btn-new-equipe").addEventListener("click", function () { openEquipeForm(null); });
      $("#equipes-q").addEventListener("input", debounce(function (e) { ui.q = e.target.value; ui.page = 1; draw(); }, 120));
      $("#equipes-status").addEventListener("change", function (e) { ui.status = e.target.value; ui.page = 1; draw(); });
      $all("tbody tr", main).forEach(function (row) { row.addEventListener("click", function () { navigate("#/equipes/" + row.getAttribute("data-id")); }); });
      bindPagination(main, ui, PAGE_SIZE, filtered, draw);
    }
    draw();
  }

  function liderDisplay(e) {
    if (e.teamLiderId && byId(STATE.pessoas, e.teamLiderId)) {
      return '<a href="#/pessoas/' + e.teamLiderId + '" style="font-weight:700;">' + esc(liderName(e)) + "</a>";
    }
    if (e.teamLider) return esc(e.teamLider) + ' <span class="hint">(não vinculado a um cadastro de pessoa)</span>';
    return "—";
  }

  function renderEquipeDetail(main, id) {
    var e = byId(STATE.equipes, id);
    if (!e) { navigate("#/equipes"); return; }
    main.innerHTML =
      '<div class="topbar"><div><button class="link-btn" id="back-btn">← Equipes</button><h1 style="margin-top:6px;">' + esc(e.nome) + "</h1>" +
      '<div class="sub">Líder: ' + liderDisplay(e) + " · " + statusPillGeneric(e.status) + "</div>" +
      '<div class="header-field-notes">' + fieldNoteHtml("nome", "Nome") + fieldNoteHtml("status", "Status") + "</div>" +
      "</div>" +
      '<div style="display:flex;gap:8px;">' +
      (canDo("equipes", "editar") ? '<button class="btn" id="btn-edit-equipe">Editar</button>' : "") +
      (canDo("equipes", "excluir") ? '<button class="btn danger" id="btn-del-equipe">' + ICONS.trash + "Excluir</button>" : "") +
      "</div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Dados da equipe</h3></div><div class="panel-body pad"><div class="detail-grid">' +
      detailItem("Regional", e.regional, "regional") + detailItem("Projeto", e.projeto, "projeto") + detailItem("Operadora", e.operadora, "operadora") + detailItem("Status", e.status, "status") +
      "</div></div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Membros (' + e.membros.length + ')</h3>' + (canDo("equipes", "editar") ? '<button class="btn sm primary" id="btn-add-membro">' + ICONS.plus + "Adicionar membro</button>" : "") + '</div><div class="panel-body pad">' +
      (e.membros.length ? e.membros.map(function (m, idx) {
        var pessoa = m.pessoaId ? byId(STATE.pessoas, m.pessoaId) : null;
        return '<div class="member-row"><div class="avatar-dot">' + esc(initials(m.pessoaNome)) + '</div><div class="info" ' + (pessoa ? 'style="cursor:pointer" data-pessoa="' + pessoa.id + '"' : "") + '><div class="name">' + esc(m.pessoaNome) + '</div><div class="role">' + esc(m.cargo || "—") + "</div></div>" +
          (canDo("equipes", "editar") ? '<button class="btn ghost sm" data-remove-membro="' + idx + '">' + ICONS.close + "</button>" : "") + "</div>";
      }).join("") : '<div class="hint">Nenhum membro cadastrado nesta equipe.</div>') +
      "</div></div>" +
      historyPanelHtml("equipe", e.id);
    loadHistoryPanel("equipe", e.id);

    $("#back-btn").addEventListener("click", function () { navigate("#/equipes"); });
    if ($("#btn-edit-equipe")) $("#btn-edit-equipe").addEventListener("click", function () { openEquipeForm(e); });
    if ($("#btn-del-equipe")) $("#btn-del-equipe").addEventListener("click", function () { confirmDelete("equipe", e.id, e.nome); });
    if ($("#btn-add-membro")) $("#btn-add-membro").addEventListener("click", function () { openAddMembro(e); });
    $all("[data-pessoa]", main).forEach(function (r) { r.addEventListener("click", function () { navigate("#/pessoas/" + r.getAttribute("data-pessoa")); }); });
    $all("[data-remove-membro]", main).forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (!canDo("equipes", "editar")) { toast("Você não tem permissão para isso.", "error"); return; }
        var idx = Number(btn.getAttribute("data-remove-membro"));
        var m = e.membros[idx];
        if (!m) return;
        apiFetch("/api/equipes/" + e.id + "/membros/" + m.pessoaId, { method: "DELETE" })
          .then(function () {
            e.membros.splice(idx, 1);
            render();
          })
          .catch(handleApiError);
      });
    });
  }

  function openEquipeForm(e) {
    var isNew = !e;
    var pessoasOpts = STATE.pessoas.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); })
      .map(function (p) { return '<option value="' + p.id + '"' + (e && e.teamLiderId === p.id ? " selected" : "") + '>' + esc(p.nome) + (p.cargo ? " — " + esc(p.cargo) : "") + "</option>"; }).join("");
    var keepLabel = e && e.teamLider && !e.teamLiderId ? "Manter texto atual: " + e.teamLider : "— nenhum —";
    var html =
      '<div class="drawer-head"><div><h2>' + (isNew ? "Nova equipe" : "Editar equipe") + '</h2><div class="sub">Informações gerais do time</div></div>' +
      '<button class="btn ghost sm" id="drawer-close">' + ICONS.close + "</button></div>" +
      '<form class="drawer-body" id="equipe-form"><div class="field-grid">' +
      field("Nome da equipe *", "nome", "text", e, { required: true, span2: true }) +
      '<div class="field span2"><label>Team líder</label><select name="teamLiderId"><option value="">' + esc(keepLabel) + "</option>" + pessoasOpts + "</select>" +
      (e && e.teamLiderId ? '<label class="hint" style="margin-top:6px;display:block;"><input type="checkbox" name="removerLider"> remover líder desta equipe</label>' : "") +
      '<div class="hint" style="margin-top:4px;">O líder precisa estar cadastrado em Pessoas. Se não encontrar o nome, cadastre a pessoa primeiro.</div>' +
      "</div>" +
      field("Regional", "regional", "text", e) + field("Projeto", "projeto", "text", e) +
      field("Operadora", "operadora", "text", e) + selectField("Status", "status", STATUS_OPTS, e ? e.status : "ATIVO") +
      "</div></form>" +
      '<div class="drawer-foot"><span></span><div style="display:flex;gap:8px;"><button type="button" class="btn" id="drawer-cancel">Cancelar</button><button type="submit" form="equipe-form" class="btn primary">' + ICONS.check + "Salvar</button></div></div>";
    openDrawer(html);
    $("#equipe-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!canDo("equipes", isNew ? "criar" : "editar")) { toast("Você não tem permissão para isso.", "error"); return; }
      var fd = new FormData(ev.target);
      var body = {};
      ["nome", "regional", "projeto", "operadora", "status"].forEach(function (k) { body[k] = (fd.get(k) || "").toString().trim(); });
      if (!body.nome) { toast("Informe o nome da equipe.", "error"); return; }
      var liderVal = fd.get("teamLiderId");
      if (fd.get("removerLider")) {
        body.teamLiderId = null; body.teamLider = null;
      } else if (liderVal) {
        body.teamLiderId = Number(liderVal);
      } // senão: não manda a chave — mantém o líder atual (edição) ou fica sem líder (nova equipe)

      var req = isNew
        ? apiFetch("/api/equipes", { method: "POST", body: body })
        : apiFetch("/api/equipes/" + e.id, { method: "PATCH", body: body });

      req.then(function (data) {
        var rec = mapEquipeFromApi(data);
        if (!isNew) rec.membros = e.membros; // PATCH não devolve membros — preserva os já carregados localmente
        if (isNew) STATE.equipes.push(rec);
        else {
          var idx = STATE.equipes.findIndex(function (x) { return x.id === rec.id; });
          if (idx !== -1) STATE.equipes[idx] = rec;
        }
        closeDrawer();
        render();
        renderShellCounts();
        toast(isNew ? "Equipe criada." : "Equipe atualizada.", "success");
        navigate("#/equipes/" + rec.id);
      }).catch(handleApiError);
    });
    $("#drawer-close").addEventListener("click", closeDrawer);
    $("#drawer-cancel").addEventListener("click", closeDrawer);
  }

  function openAddMembro(equipe) {
    var pessoasOpts = STATE.pessoas.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); })
      .map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + (p.cargo ? " — " + esc(p.cargo) : "") + "</option>"; }).join("");
    var html =
      '<div class="modal-box"><h3>Adicionar membro</h3><p>Selecione uma pessoa cadastrada e o cargo dela nesta equipe.</p>' +
      '<form id="membro-form" class="field-grid one">' +
      '<div class="field"><label>Pessoa *</label><select name="pessoaId" required><option value="">Selecione…</option>' + pessoasOpts + "</select></div>" +
      '<div class="field"><label>Cargo na equipe</label><input type="text" name="cargo" placeholder="Ex.: MEMBRO, TEAM LIDER…"></div>' +
      '<div class="modal-actions"><button type="button" class="btn" id="modal-cancel">Cancelar</button><button type="submit" class="btn primary">Adicionar</button></div>' +
      "</form></div>";
    openModal(html);
    $("#membro-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!canDo("equipes", "editar")) { toast("Você não tem permissão para isso.", "error"); return; }
      var fd = new FormData(ev.target);
      var pid = Number(fd.get("pessoaId"));
      var pessoa = byId(STATE.pessoas, pid);
      if (!pessoa) return;
      var cargo = (fd.get("cargo") || "").toString().trim();
      apiFetch("/api/equipes/" + equipe.id + "/membros", { method: "POST", body: { pessoaId: pid, cargo: cargo } })
        .then(function () {
          equipe.membros.push({ pessoaId: pid, pessoaNome: pessoa.nome, cargo: cargo });
          closeModal();
          render();
          toast("Membro adicionado.", "success");
        })
        .catch(handleApiError);
    });
    $("#modal-cancel").addEventListener("click", closeModal);
  }

  /* ================================================================
     EMPRESAS
     ================================================================ */
  function renderEmpresasList(main) {
    var ui = uiState.empresas;

    function computeFiltered() {
      var all = STATE.empresas.slice().sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
      return all.filter(function (e) {
        if (ui.status && e.status !== ui.status) return false;
        if (!ui.q) return true;
        var hay = normalize([e.nome, e.fantasia, e.cnpj, e.cidade, e.uf].join(" "));
        return hay.indexOf(normalize(ui.q)) !== -1;
      });
    }

    function draw() {
      var filtered = computeFiltered();
      withFocusPreserved(function () { drawInto(filtered); });
    }

    function drawInto(filtered) {
      var pg = paginate(filtered, ui.page, PAGE_SIZE);
      ui.page = pg.page;
      var body = pg.items.map(function (e) {
        return '<tr data-id="' + e.id + '">' +
          '<td><div class="row-primary">' + esc(empresaTitle(e)) + '</div><div class="row-secondary mono">' + esc(e.cnpj || "—") + '</div></td>' +
          '<td>' + esc(e.cidade || "—") + (e.uf ? "/" + esc(e.uf) : "") + '</td><td>' + esc(e.porte || "—") + '</td>' +
          '<td>' + statusPillGeneric(e.status) + "</td></tr>";
      }).join("");
      var toolbar =
        '<div class="search-wrap">' + ICONS.search + '<input type="text" id="empresas-q" placeholder="Buscar por razão social, CNPJ, cidade…" value="' + esc(ui.q) + '"></div>' +
        '<select class="filter" id="empresas-status"><option value="">Todos os status</option>' +
        distinctStatuses(STATE.empresas).map(function (s) { return '<option value="' + esc(s) + '"' + (ui.status === s ? " selected" : "") + '>' + esc(s) + "</option>"; }).join("") + "</select>";

      main.innerHTML =
        '<div class="topbar"><div><h1>Empresas</h1><div class="sub">Empresas contratadas (MEI/PJ) e prestadoras</div></div>' +
        (canDo("empresas", "criar") ? '<button class="btn primary" id="btn-new-empresa">' + ICONS.plus + "Nova empresa</button>" : "") + "</div>" +
        tableShell({
          toolbar: toolbar,
          headHtml: "<th>Empresa</th><th>Cidade/UF</th><th>Porte</th><th>Status</th>",
          bodyHtml: body, count: filtered.length, page: pg.page, totalPages: pg.totalPages,
          empty: "Nenhuma empresa encontrada."
        });

      if ($("#btn-new-empresa")) $("#btn-new-empresa").addEventListener("click", function () { openEmpresaForm(null); });
      $("#empresas-q").addEventListener("input", debounce(function (e) { ui.q = e.target.value; ui.page = 1; draw(); }, 120));
      $("#empresas-status").addEventListener("change", function (e) { ui.status = e.target.value; ui.page = 1; draw(); });
      $all("tbody tr", main).forEach(function (row) { row.addEventListener("click", function () { navigate("#/empresas/" + row.getAttribute("data-id")); }); });
      bindPagination(main, ui, PAGE_SIZE, filtered, draw);
    }
    draw();
  }

  function renderEmpresaDetail(main, id) {
    var e = byId(STATE.empresas, id);
    if (!e) { navigate("#/empresas"); return; }
    var pessoasVinculadas = STATE.pessoas.filter(function (p) { return p.empresaId === e.id; });
    main.innerHTML =
      '<div class="topbar"><div><button class="link-btn" id="back-btn">← Empresas</button><h1 style="margin-top:6px;">' + esc(empresaTitle(e)) + "</h1>" +
      '<div class="sub mono">' + esc(e.cnpj || "—") + " · " + statusPillGeneric(e.status) + "</div>" +
      '<div class="header-field-notes">' + fieldNoteHtml("nome", "Razão social") + fieldNoteHtml("status", "Status") + "</div>" +
      "</div>" +
      '<div style="display:flex;gap:8px;">' +
      (canDo("empresas", "editar") ? '<button class="btn" id="btn-edit-empresa">Editar</button>' : "") +
      (canDo("empresas", "excluir") ? '<button class="btn danger" id="btn-del-empresa">' + ICONS.trash + "Excluir</button>" : "") +
      "</div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Dados cadastrais</h3></div><div class="panel-body pad"><div class="detail-grid">' +
      detailItem("Razão social", e.nome, "nome") + detailItem("Nome fantasia", e.fantasia, "fantasia") + detailItem("CNPJ", e.cnpj, "cnpj") + detailItem("Porte", e.porte, "porte") +
      detailItem("CNAE principal", [e.cnaePrincipal, e.cnaeDescricao].filter(Boolean).join(" — "), "cnae_principal") + detailItem("Situação cadastral", e.situacaoCadastral, "situacao_cadastral") +
      detailItem("Cidade/UF", [e.cidade, e.uf].filter(Boolean).join("/"), "cidade") + detailItem("Endereço", [e.logradouro, e.numero, e.bairro].filter(Boolean).join(", "), "logradouro") +
      detailItem("CEP", e.cep, "cep") + detailItem("Telefone", e.telefone, "telefone") + detailItem("E-mail", e.email, "email") + detailItem("Responsável", e.nomeResponsavel, "nome_responsavel") +
      detailItem("PGR", e.pgr, "pgr") + detailItem("PCMSO", e.pcmso, "pcmso") + detailItem("Regional", e.regional, "regional") +
      "</div></div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Pessoas vinculadas (' + pessoasVinculadas.length + ')</h3></div><div class="panel-body pad">' +
      (pessoasVinculadas.length ? pessoasVinculadas.map(function (p) {
        return '<div class="member-row" style="cursor:pointer" data-pessoa="' + p.id + '"><div class="avatar-dot">' + esc(initials(p.nome)) + '</div><div class="info"><div class="name">' + esc(p.nome) + '</div><div class="role">' + esc(p.cargo || "—") + "</div></div>" + statusPillGeneric(p.status) + "</div>";
      }).join("") : '<div class="hint">Nenhuma pessoa vinculada a esta empresa.</div>') +
      "</div></div>" +
      historyPanelHtml("empresa", e.id);
    loadHistoryPanel("empresa", e.id);

    $("#back-btn").addEventListener("click", function () { navigate("#/empresas"); });
    if ($("#btn-edit-empresa")) $("#btn-edit-empresa").addEventListener("click", function () { openEmpresaForm(e); });
    if ($("#btn-del-empresa")) $("#btn-del-empresa").addEventListener("click", function () { confirmDelete("empresa", e.id, empresaTitle(e)); });
    $all("[data-pessoa]", main).forEach(function (r) { r.addEventListener("click", function () { navigate("#/pessoas/" + r.getAttribute("data-pessoa")); }); });
  }

  // Campo de CNPJ com botão "Buscar CNPJ" ao lado — preenche o resto do
  // formulário a partir de POST /api/empresas/cnpj-lookup (Receita Federal).
  function cnpjFieldHtml(e) {
    var val = e ? (e.cnpj || "") : "";
    return '<div class="field"><label>CNPJ</label><div style="display:flex;gap:6px;">' +
      '<input type="text" name="cnpj" value="' + esc(val) + '" style="flex:1;">' +
      '<button type="button" class="btn ghost sm" id="btn-cnpj-lookup" style="white-space:nowrap;">Buscar CNPJ</button>' +
      "</div></div>";
  }
  function setEmpresaFormField(form, name, value) {
    if (value === undefined || value === null) return;
    var input = form.querySelector('[name="' + name + '"]');
    if (!input) return;
    if (input.tagName === "SELECT") {
      var hasOpt = Array.prototype.some.call(input.options, function (o) { return o.value === value; });
      if (!hasOpt && value) {
        var opt = document.createElement("option");
        opt.value = value; opt.textContent = value;
        input.appendChild(opt);
      }
    }
    input.value = value;
  }
  function bindCnpjLookup(form) {
    var btn = $("#btn-cnpj-lookup", form);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var cnpjInput = form.querySelector('[name="cnpj"]');
      var digits = (cnpjInput.value || "").replace(/\D/g, "");
      if (digits.length !== 14) { toast("Informe um CNPJ com 14 dígitos.", "error"); return; }
      var originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Buscando…";
      apiFetch("/api/empresas/cnpj-lookup", { method: "POST", body: { cnpj: digits } })
        .then(function (data) {
          var r = data.empresa || {};
          setEmpresaFormField(form, "nome", r.nome);
          setEmpresaFormField(form, "fantasia", r.fantasia);
          setEmpresaFormField(form, "cnpj", r.cnpj);
          setEmpresaFormField(form, "logradouro", r.logradouro);
          setEmpresaFormField(form, "numero", r.numero);
          setEmpresaFormField(form, "bairro", r.bairro);
          setEmpresaFormField(form, "cidade", r.cidade);
          setEmpresaFormField(form, "uf", r.uf);
          setEmpresaFormField(form, "cep", r.cep);
          setEmpresaFormField(form, "telefone", r.telefone);
          setEmpresaFormField(form, "email", r.email);
          setEmpresaFormField(form, "porte", r.porte);
          setEmpresaFormField(form, "cnaePrincipal", r.cnaePrincipal);
          setEmpresaFormField(form, "cnaeDescricao", r.cnaeDescricao);
          setEmpresaFormField(form, "situacaoCadastral", r.situacaoCadastral);
          toast("Dados do CNPJ preenchidos. Confira antes de salvar.", "success");
        })
        .catch(handleApiError)
        .then(function () {
          btn.disabled = false;
          btn.textContent = originalLabel;
        });
    });
  }
  function openEmpresaForm(e) {
    var isNew = !e;
    var html =
      '<div class="drawer-head"><div><h2>' + (isNew ? "Nova empresa" : "Editar empresa") + '</h2><div class="sub">Dados cadastrais da empresa</div></div>' +
      '<button class="btn ghost sm" id="drawer-close">' + ICONS.close + "</button></div>" +
      '<form class="drawer-body" id="empresa-form"><div class="field-grid">' +
      field("Razão social *", "nome", "text", e, { required: true, span2: true }) +
      field("Nome fantasia", "fantasia", "text", e, { span2: true }) +
      cnpjFieldHtml(e) + field("Porte", "porte", "text", e) +
      field("Cidade", "cidade", "text", e) + field("UF", "uf", "text", e) +
      field("CEP", "cep", "text", e) + field("Bairro", "bairro", "text", e) +
      field("Logradouro", "logradouro", "text", e) + field("Número", "numero", "text", e) +
      field("Telefone", "telefone", "text", e) + field("E-mail", "email", "email", e) +
      field("Responsável", "nomeResponsavel", "text", e) + field("Regional", "regional", "text", e) +
      field("CNAE principal", "cnaePrincipal", "text", e) + field("Descrição CNAE", "cnaeDescricao", "text", e) +
      field("PGR", "pgr", "text", e) + field("PCMSO", "pcmso", "text", e) +
      selectField("Situação cadastral", "situacaoCadastral", ["ATIVA", "INATIVA", "BAIXADA"], e ? e.situacaoCadastral : "ATIVA") +
      selectField("Status", "status", STATUS_OPTS, e ? e.status : "ATIVO") +
      "</div></form>" +
      '<div class="drawer-foot"><span></span><div style="display:flex;gap:8px;"><button type="button" class="btn" id="drawer-cancel">Cancelar</button><button type="submit" form="empresa-form" class="btn primary">' + ICONS.check + "Salvar</button></div></div>";
    openDrawer(html);
    var formEl = $("#empresa-form");
    bindCnpjLookup(formEl);
    formEl.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!canDo("empresas", isNew ? "criar" : "editar")) { toast("Você não tem permissão para isso.", "error"); return; }
      var fd = new FormData(ev.target);
      var body = {};
      var camposEditaveis = ["nome", "fantasia", "cnpj", "porte", "cidade", "uf", "cep", "bairro", "logradouro", "numero", "telefone", "email",
        "nomeResponsavel", "regional", "cnaePrincipal", "cnaeDescricao", "pgr", "pcmso", "situacaoCadastral", "status"];
      camposEditaveis.forEach(function (k) { body[k] = (fd.get(k) || "").toString().trim(); });
      if (!body.nome) { toast("Informe a razão social.", "error"); return; }

      var req = isNew
        ? apiFetch("/api/empresas", { method: "POST", body: body })
        : apiFetch("/api/empresas/" + e.id, { method: "PATCH", body: body });

      req.then(function (data) {
        var rec = mapEmpresaFromApi(data);
        if (isNew) STATE.empresas.push(rec);
        else {
          var idx = STATE.empresas.findIndex(function (x) { return x.id === rec.id; });
          if (idx !== -1) STATE.empresas[idx] = rec;
        }
        // mantém o cache empresaNome em STATE.pessoas em dia (o servidor já
        // sincroniza no banco quando nome/fantasia mudam — ver PATCH de empresas).
        STATE.pessoas.forEach(function (p) { if (p.empresaId === rec.id) p.empresaNome = empresaTitle(rec); });
        closeDrawer();
        render();
        renderShellCounts();
        toast(isNew ? "Empresa cadastrada." : "Empresa atualizada.", "success");
        navigate("#/empresas/" + rec.id);
      }).catch(handleApiError);
    });
    $("#drawer-close").addEventListener("click", closeDrawer);
    $("#drawer-cancel").addEventListener("click", closeDrawer);
  }

  /* ================================================================
     TREINAMENTOS — visão geral (painel visual)
     ================================================================ */
  function pessoaRegional(pessoaId) {
    var p = pessoaId ? byId(STATE.pessoas, pessoaId) : null;
    return p && p.regional ? p.regional.trim() : "";
  }
  function normReg(v) {
    v = (v || "").trim();
    return v ? v.toUpperCase() : "SEM REGIONAL";
  }
  var MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  function computeTreinoOverview() {
    var byStatus = { VALIDO: 0, A_VENCER: 0, A_VENCER_60: 0, VENCIDO: 0, SEM_VENCIMENTO: 0 };
    var byTipo = {}, byRegional = {}, byPessoa = {}, monthCounts = {}, vencidosCount = 0;
    var list = activeTreinamentos();
    list.forEach(function (t) {
      var st = trainingStatus(t);
      byStatus[st.code] = (byStatus[st.code] || 0) + 1;
      if (st.code === "VENCIDO" || st.code === "A_VENCER") {
        var k = st.code === "VENCIDO" ? "vencido" : "aVencer";
        if (!byTipo[t.tipo]) byTipo[t.tipo] = { vencido: 0, aVencer: 0 };
        byTipo[t.tipo][k]++;
        var reg = normReg(pessoaRegional(t.pessoaId));
        if (!byRegional[reg]) byRegional[reg] = { vencido: 0, aVencer: 0 };
        byRegional[reg][k]++;
        if (t.pessoaId) {
          if (!byPessoa[t.pessoaId]) byPessoa[t.pessoaId] = { nome: t.pessoaNome, vencido: 0, aVencer: 0 };
          byPessoa[t.pessoaId][k]++;
        }
      }
      if (st.code === "VENCIDO") vencidosCount++;
      if (t.vencimento && (st.code === "A_VENCER" || st.code === "VALIDO")) {
        var ym = t.vencimento.slice(0, 7);
        monthCounts[ym] = (monthCounts[ym] || 0) + 1;
      }
    });
    return { byStatus: byStatus, byTipo: byTipo, byRegional: byRegional, byPessoa: byPessoa, monthCounts: monthCounts, vencidosCount: vencidosCount, total: list.length };
  }

  function statusBarLgHtml(byStatus, total) {
    total = total || 1;
    var defs = [["VALIDO", "ok", "Válido"], ["A_VENCER", "warn", "A vencer (30 dias)"], ["A_VENCER_60", "info", "A vencer (60 dias)"], ["VENCIDO", "danger", "Vencido"], ["SEM_VENCIMENTO", "neutral", "Sem vencimento"]];
    var segs = defs.map(function (d) {
      var n = byStatus[d[0]] || 0;
      if (!n) return "";
      var pct = (n / total * 100);
      return '<div class="seg ' + d[1] + '" tabindex="0" style="flex-grow:' + pct.toFixed(3) + ';" data-status-code="' + d[0] + '" data-tip-title="' + esc(d[2]) + '" data-tip-sub="' + n + " registros (" + pct.toFixed(1) + '%)"><span>' + n + "</span></div>";
    }).join("");
    var legend = defs.map(function (d) {
      var n = byStatus[d[0]] || 0;
      return '<button type="button" class="legend-item" data-status-code="' + d[0] + '"><span class="legend-swatch ' + d[1] + '"></span>' + d[2] + " — " + n + "</button>";
    }).join("");
    return '<div class="status-bar-lg">' + segs + '</div><div class="legend-row">' + legend + "</div>";
  }

  /* -- Pendências por item: Pendente / Vencido / Renovar (≤30 dias) / A vencer (60 dias) -- */
  function treinoStatusKey(t) {
    var code = trainingStatus(t).code;
    if (code === "VENCIDO") return "vencido";
    if (code === "A_VENCER") return "renovar";
    if (code === "A_VENCER_60") return "renovar60";
    if (code === "SEM_VENCIMENTO") return "pendente";
    return null; // VALIDO — não entra nesse painel
  }
  function statusKeyLabel(key) {
    return key === "vencido" ? "Vencido" : key === "renovar" ? "Renovar" : key === "renovar60" ? "A vencer (60 dias)" : "Pendente";
  }
  function statusKeyCls(key) {
    return key === "vencido" ? "danger" : key === "renovar" ? "warn" : key === "renovar60" ? "info" : "neutral";
  }
  function diasLabel(item) {
    if (item.statusKey === "pendente" || item.dias === null) return "Sem data";
    if (item.dias < 0) return "Vencido há " + Math.abs(item.dias) + " dia" + (Math.abs(item.dias) !== 1 ? "s" : "");
    if (item.dias === 0) return "Vence hoje";
    return "Faltam " + item.dias + " dia" + (item.dias !== 1 ? "s" : "");
  }
  function groupKeyOf(kind, t) {
    return kind === "regional" ? normReg(pessoaRegional(t.pessoaId)) : t.tipo;
  }
  function computeGroupStatusMap(kind) {
    var map = {};
    activeTreinamentos().forEach(function (t) {
      var key = treinoStatusKey(t);
      if (!key) return;
      var g = groupKeyOf(kind, t);
      if (!map[g]) map[g] = { pendente: 0, vencido: 0, renovar: 0, renovar60: 0 };
      map[g][key]++;
    });
    return map;
  }
  function pendenciaItemsForGroup(kind, groupValue, statusKey) {
    return activeTreinamentos().filter(function (t) {
      if (groupKeyOf(kind, t) !== groupValue) return false;
      var key = treinoStatusKey(t);
      if (key === null) return false;
      if (statusKey && key !== statusKey) return false;
      return true;
    }).map(function (t) {
      var key = treinoStatusKey(t);
      return {
        pessoaId: t.pessoaId, pessoaNome: t.pessoaNome, regional: pessoaRegional(t.pessoaId), tipo: t.tipo,
        vencimento: t.vencimento, dias: t.vencimento ? daysUntil(t.vencimento) : null, statusKey: key
      };
    }).sort(function (a, b) {
      var rank = { vencido: 0, renovar: 1, renovar60: 2, pendente: 3 };
      if (rank[a.statusKey] !== rank[b.statusKey]) return rank[a.statusKey] - rank[b.statusKey];
      if (a.dias === null && b.dias === null) return 0;
      if (a.dias === null) return 1;
      if (b.dias === null) return -1;
      return a.dias - b.dias;
    });
  }
  function statusBarsHtml(map, kind) {
    var rows = Object.keys(map).map(function (g) {
      var r = map[g];
      return { g: g, pendente: r.pendente, vencido: r.vencido, renovar: r.renovar, renovar60: r.renovar60, total: r.pendente + r.vencido + r.renovar + r.renovar60 };
    }).filter(function (r) { return r.total > 0; });
    rows.sort(function (a, b) { return b.total - a.total; });
    if (!rows.length) return '<div class="empty-state" style="padding:20px;">Nenhuma pendência encontrada — tudo em dia.</div>';
    var max = rows[0].total || 1;
    var body = rows.map(function (r) {
      var pct = Math.max(6, Math.round((r.total / max) * 100));
      var visibleCount = (r.pendente ? 1 : 0) + (r.vencido ? 1 : 0) + (r.renovar ? 1 : 0) + (r.renovar60 ? 1 : 0);
      var minPx = visibleCount * 26; // guarantees room for each segment's number label
      function seg(key, cls, n, label) {
        if (!n) return "";
        return '<div class="rankbar-seg ' + cls + '" style="flex-grow:' + n + '" data-status-bar="' + key + '" data-tip-title="' + esc(r.g) + " — " + label + '" data-tip-sub="' + n + " pessoa" + (n !== 1 ? "s" : "") + '"><span>' + n + "</span></div>";
      }
      var tip = r.pendente + " pendente" + (r.pendente !== 1 ? "s" : "") + " · " + r.vencido + " vencido" + (r.vencido !== 1 ? "s" : "") + " · " + r.renovar + " a renovar (30d)" + " · " + r.renovar60 + " a vencer (60d)";
      return '<div class="rankbar-row" tabindex="0" data-group-kind="' + kind + '" data-group-bar="' + esc(r.g) + '" data-tip-title="' + esc(r.g) + '" data-tip-sub="' + esc(tip) + '">' +
        '<div class="rankbar-label">' + esc(r.g) + '</div>' +
        '<div class="rankbar-track"><div class="rankbar-fill" style="width:max(' + pct + '%, ' + minPx + 'px);">' +
        seg("pendente", "neutral", r.pendente, "Pendente") +
        seg("vencido", "danger", r.vencido, "Vencido") +
        seg("renovar", "warn", r.renovar, "Renovar (30 dias)") +
        seg("renovar60", "info", r.renovar60, "A vencer (60 dias)") +
        "</div></div>" +
        '<div class="rankbar-total">' + r.total + "</div>" +
        "</div>";
    }).join("");
    var legend = '<div class="legend-row">' +
      '<span class="legend-item" style="cursor:default;"><span class="legend-swatch neutral"></span>Pendente (sem data)</span>' +
      '<span class="legend-item" style="cursor:default;"><span class="legend-swatch danger"></span>Vencido</span>' +
      '<span class="legend-item" style="cursor:default;"><span class="legend-swatch warn"></span>Renovar (≤ 30 dias)</span>' +
      '<span class="legend-item" style="cursor:default;"><span class="legend-swatch info"></span>A vencer (31–60 dias)</span>' +
      "</div>";
    return '<div class="rankbar-list">' + body + "</div>" + legend;
  }
  // Rótulo do pill igual ao de statusKeyLabel, mas sem o "(60 dias)" fixo em
  // "A vencer (60 dias)" — nesta tela o número de dias já aparece ao lado
  // (via diasLabel), calculado em cima do vencimento real de cada item, então
  // o texto fixo do bucket fica redundante/impreciso (um item pode estar a
  // 32 ou a 58 dias e os dois caem no mesmo "60 dias").
  function statusKeyLabelDrawer(key) {
    return key === "renovar60" ? "A vencer" : statusKeyLabel(key);
  }
  function openGroupPendenciaDrawer(kind, groupValue, statusKey) {
    var items = pendenciaItemsForGroup(kind, groupValue, statusKey);
    var extraColLabel = kind === "regional" ? "Item" : "Regional";
    var rows = items.map(function (it) {
      var extraVal = kind === "regional" ? it.tipo : (it.regional || "—");
      return '<tr data-pessoa="' + it.pessoaId + '">' +
        '<td class="row-primary">' + esc(it.pessoaNome || "—") + '</td>' +
        '<td>' + esc(extraVal) + '</td>' +
        '<td>' + esc(pessoaLiderNome(it.pessoaId) || "—") + '</td>' +
        '<td>' + esc(pessoaCoordenadorNome(it.pessoaId) || "—") + '</td>' +
        '<td><span class="pill ' + statusKeyCls(it.statusKey) + '">' + statusKeyLabelDrawer(it.statusKey) + '</span> <span class="hint">' + esc(diasLabel(it)) + '</span></td>' +
        '<td class="mono">' + esc(fmtDateBR(it.vencimento)) + '</td>' +
        "</tr>";
    }).join("");
    var subtitle = items.length + " pendência" + (items.length !== 1 ? "s" : "") +
      (statusKey ? " · " + statusKeyLabel(statusKey).toLowerCase() : "") + " · pessoas ativas";
    var titulo = esc(groupValue) + (statusKey ? " — " + statusKeyLabel(statusKey) : "");
    var html =
      '<div class="drawer-head"><div><h2>' + titulo + '</h2><div class="sub">' + esc(subtitle) + '</div></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">' +
      '<button class="btn ghost sm" id="drawer-download">' + ICONS.download + 'Baixar Excel</button>' +
      '<button class="btn ghost sm" id="drawer-copy">' + ICONS.copy + 'Copiar tabela</button>' +
      '<button class="btn ghost sm" id="drawer-close">' + ICONS.close + "</button></div></div>" +
      '<div class="drawer-body">' +
      (items.length
        ? '<div class="table-scroll"><table class="data"><thead><tr><th>Pessoa</th><th>' + extraColLabel + '</th><th>Líder</th><th>Coordenador</th><th>Status</th><th>Vencimento</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<div class="empty-state" style="padding:20px;">Nenhuma pendência encontrada.</div>') +
      "</div>";
    openDrawer(html, { wide: true });
    $("#drawer-close").addEventListener("click", closeDrawer);
    var exportHeaders = ["Pessoa", extraColLabel, "Líder", "Coordenador", "Status", "Dias", "Vencimento"];
    function exportRows() {
      return items.map(function (it) {
        var extraVal = kind === "regional" ? it.tipo : (it.regional || "");
        return [it.pessoaNome || "", extraVal, pessoaLiderNome(it.pessoaId) || "", pessoaCoordenadorNome(it.pessoaId) || "", statusKeyLabelDrawer(it.statusKey), diasLabel(it), fmtDateBR(it.vencimento)];
      });
    }
    var filenameBase = groupValue + (statusKey ? " - " + statusKeyLabel(statusKey) : "");
    $("#drawer-download").addEventListener("click", function () { downloadRowsAsXls(filenameBase, exportHeaders, exportRows()); });
    $("#drawer-copy").addEventListener("click", function () { copyRowsToClipboard(exportHeaders, exportRows()); });
    $all("[data-pessoa]", $("#drawer-content")).forEach(function (row) {
      row.addEventListener("click", function () { closeDrawer(); navigate("#/pessoas/" + row.getAttribute("data-pessoa")); });
    });
  }

  /* -- Distribuição por status (KPIs + gráfico geral) — visão sem recorte por item/regional -- */
  var STATUS_CODE_LABELS = { VALIDO: "Válido", A_VENCER: "A vencer (30 dias)", A_VENCER_60: "A vencer (60 dias)", VENCIDO: "Vencido", SEM_VENCIMENTO: "Sem vencimento" };
  function diasLabelGeneric(dias) {
    if (dias === null) return "Sem data";
    if (dias < 0) return "Vencido há " + Math.abs(dias) + " dia" + (Math.abs(dias) !== 1 ? "s" : "");
    if (dias === 0) return "Vence hoje";
    return "Faltam " + dias + " dia" + (dias !== 1 ? "s" : "");
  }
  function pendenciaItemsByStatusCode(code) {
    return activeTreinamentos().filter(function (t) { return trainingStatus(t).code === code; })
      .map(function (t) {
        return {
          pessoaId: t.pessoaId, pessoaNome: t.pessoaNome, regional: pessoaRegional(t.pessoaId), tipo: t.tipo,
          vencimento: t.vencimento, dias: t.vencimento ? daysUntil(t.vencimento) : null, st: trainingStatus(t)
        };
      }).sort(function (a, b) {
        if (a.dias === null && b.dias === null) return 0;
        if (a.dias === null) return 1;
        if (b.dias === null) return -1;
        return a.dias - b.dias;
      });
  }
  function openStatusOverviewDrawer(code) {
    var items = pendenciaItemsByStatusCode(code);
    var rows = items.map(function (it) {
      return '<tr data-pessoa="' + it.pessoaId + '">' +
        '<td class="row-primary">' + esc(it.pessoaNome || "—") + '</td>' +
        '<td>' + esc(it.tipo) + '</td>' +
        '<td>' + esc(it.regional || "—") + '</td>' +
        '<td>' + esc(pessoaLiderNome(it.pessoaId) || "—") + '</td>' +
        '<td>' + esc(pessoaCoordenadorNome(it.pessoaId) || "—") + '</td>' +
        '<td>' + esc(diasLabelGeneric(it.dias)) + '</td>' +
        '<td class="mono">' + esc(fmtDateBR(it.vencimento)) + '</td>' +
        "</tr>";
    }).join("");
    var titulo = STATUS_CODE_LABELS[code] || code;
    var subtitle = items.length + " registro" + (items.length !== 1 ? "s" : "") + " · pessoas ativas";
    var html =
      '<div class="drawer-head"><div><h2>' + esc(titulo) + '</h2><div class="sub">' + esc(subtitle) + '</div></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">' +
      '<button class="btn ghost sm" id="drawer-download">' + ICONS.download + 'Baixar Excel</button>' +
      '<button class="btn ghost sm" id="drawer-copy">' + ICONS.copy + 'Copiar tabela</button>' +
      '<button class="btn ghost sm" id="drawer-close">' + ICONS.close + "</button></div></div>" +
      '<div class="drawer-body">' +
      (items.length
        ? '<div class="table-scroll"><table class="data"><thead><tr><th>Pessoa</th><th>Item</th><th>Regional</th><th>Líder</th><th>Coordenador</th><th>Dias</th><th>Vencimento</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<div class="empty-state" style="padding:20px;">Nenhum registro para este status.</div>') +
      "</div>";
    openDrawer(html, { wide: true });
    $("#drawer-close").addEventListener("click", closeDrawer);
    var exportHeaders = ["Pessoa", "Item", "Regional", "Líder", "Coordenador", "Dias", "Vencimento"];
    function exportRows() {
      return items.map(function (it) {
        return [it.pessoaNome || "", it.tipo || "", it.regional || "", pessoaLiderNome(it.pessoaId) || "", pessoaCoordenadorNome(it.pessoaId) || "", diasLabelGeneric(it.dias), fmtDateBR(it.vencimento)];
      });
    }
    $("#drawer-download").addEventListener("click", function () { downloadRowsAsXls(titulo, exportHeaders, exportRows()); });
    $("#drawer-copy").addEventListener("click", function () { copyRowsToClipboard(exportHeaders, exportRows()); });
    $all("[data-pessoa]", $("#drawer-content")).forEach(function (row) {
      row.addEventListener("click", function () { closeDrawer(); navigate("#/pessoas/" + row.getAttribute("data-pessoa")); });
    });
  }

  /* -- Cabeçalho de pessoas/equipes (contagens + por regional) -- */
  function cargoNorm(p) { return (p.cargo || "").trim().toUpperCase(); }
  function countPessoasAtivas(cargoFiltro) {
    return STATE.pessoas.filter(function (p) {
      if (p.status !== "ATIVO") return false;
      if (CARGOS_PAINEL.indexOf(cargoNorm(p)) === -1) return false;
      if (cargoFiltro && cargoNorm(p) !== cargoFiltro) return false;
      return true;
    }).length;
  }
  function countEquipesAtivas() {
    return teamLideresAtivos().length;
  }
  function simpleCountByRegional(list, regionalOf) {
    var map = {};
    list.forEach(function (item) {
      var reg = normReg(regionalOf(item));
      map[reg] = (map[reg] || 0) + 1;
    });
    return map;
  }
  function equipesAtivasPorRegional() {
    return simpleCountByRegional(teamLideresAtivos(), function (p) { return p.regional; });
  }
  function pessoasAtivasPorRegional(cargoFiltro) {
    return simpleCountByRegional(STATE.pessoas.filter(function (p) {
      if (p.status !== "ATIVO") return false;
      if (CARGOS_PAINEL.indexOf(cargoNorm(p)) === -1) return false;
      if (cargoFiltro && cargoNorm(p) !== cargoFiltro) return false;
      return true;
    }), function (p) { return p.regional; });
  }
  function simpleBarsHtml(counts, barKind) {
    var rows = Object.keys(counts).map(function (k) { return { label: k, n: counts[k] }; }).filter(function (r) { return r.n > 0; });
    rows.sort(function (a, b) { return b.n - a.n; });
    if (!rows.length) return '<div class="empty-state" style="padding:20px;">Nenhum dado encontrado.</div>';
    var max = rows[0].n || 1;
    var body = rows.map(function (r) {
      var pct = Math.max(6, Math.round((r.n / max) * 100));
      return '<div class="rankbar-row" tabindex="0" data-simple-bar="' + barKind + '" data-simple-bar-value="' + esc(r.label) + '" data-tip-title="' + esc(r.label) + '" data-tip-sub="' + r.n + " registro" + (r.n !== 1 ? "s" : "") + '">' +
        '<div class="rankbar-label">' + esc(r.label) + '</div>' +
        '<div class="rankbar-track"><div class="rankbar-fill" style="width:max(' + pct + '%, 26px);">' +
        '<div class="rankbar-seg accent" style="flex-grow:1;"><span>' + r.n + "</span></div>" +
        "</div></div>" +
        '<div class="rankbar-total">' + r.n + "</div>" +
        "</div>";
    }).join("");
    return '<div class="rankbar-list">' + body + "</div>";
  }
  function openGenericTableDrawer(opts) {
    var html =
      '<div class="drawer-head"><div><h2>' + esc(opts.title) + '</h2><div class="sub">' + esc(opts.subtitle) + '</div></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">' +
      '<button class="btn ghost sm" id="drawer-download">' + ICONS.download + 'Baixar Excel</button>' +
      '<button class="btn ghost sm" id="drawer-copy">' + ICONS.copy + 'Copiar tabela</button>' +
      '<button class="btn ghost sm" id="drawer-close">' + ICONS.close + "</button></div></div>" +
      '<div class="drawer-body">' +
      (opts.rowsHtml
        ? '<div class="table-scroll"><table class="data"><thead><tr>' + opts.theadHtml + "</tr></thead><tbody>" + opts.rowsHtml + "</tbody></table></div>"
        : '<div class="empty-state" style="padding:20px;">Nenhum registro encontrado.</div>') +
      "</div>";
    openDrawer(html, { wide: true });
    $("#drawer-close").addEventListener("click", closeDrawer);
    $("#drawer-download").addEventListener("click", function () { downloadRowsAsXls(opts.title, opts.exportHeaders, opts.exportRows); });
    $("#drawer-copy").addEventListener("click", function () { copyRowsToClipboard(opts.exportHeaders, opts.exportRows); });
    if (opts.onRowBind) opts.onRowBind($("#drawer-content"));
  }
  function openEquipesRegionalDrawer(regional) {
    var list = teamLideresAtivos().filter(function (p) { return normReg(p.regional) === regional; })
      .slice().sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
    var rowsHtml = list.map(function (p) {
      return '<tr data-pessoa="' + p.id + '"><td class="row-primary">' + esc(p.nome) + '</td><td>' + esc(p.empresaNome || "—") + '</td><td>' + esc(p.projeto || "—") + "</td></tr>";
    }).join("");
    openGenericTableDrawer({
      title: regional + " — Equipes ativas",
      subtitle: list.length + " equipe" + (list.length !== 1 ? "s" : ""),
      theadHtml: "<th>Team Líder</th><th>Empresa</th><th>Projeto</th>",
      rowsHtml: rowsHtml,
      exportHeaders: ["Team Líder", "Empresa", "Projeto"],
      exportRows: list.map(function (p) { return [p.nome || "", p.empresaNome || "", p.projeto || ""]; }),
      onRowBind: function (root) {
        $all("[data-pessoa]", root).forEach(function (row) {
          row.addEventListener("click", function () { closeDrawer(); navigate("#/pessoas/" + row.getAttribute("data-pessoa")); });
        });
      }
    });
  }
  function isClienteOutro(e) {
    var pj = projetoNorm(e);
    return !CLIENTES.some(function (c) { return c.key === pj; });
  }
  function openEquipesRegionalClienteDrawer(regional, clienteKey, clienteNome) {
    var list = teamLideresAtivos().filter(function (p) {
      if (normReg(p.regional) !== regional) return false;
      return clienteKey === "OUTROS" ? isClienteOutro(p) : projetoNorm(p) === clienteKey;
    }).slice().sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
    var rowsHtml = list.map(function (p) {
      return '<tr data-pessoa="' + p.id + '"><td class="row-primary">' + esc(p.nome) + '</td><td>' + esc(p.empresaNome || "—") + "</td></tr>";
    }).join("");
    openGenericTableDrawer({
      title: regional + " — " + clienteNome,
      subtitle: list.length + " equipe" + (list.length !== 1 ? "s" : ""),
      theadHtml: "<th>Team Líder</th><th>Empresa</th>",
      rowsHtml: rowsHtml,
      exportHeaders: ["Team Líder", "Empresa"],
      exportRows: list.map(function (p) { return [p.nome || "", p.empresaNome || ""]; }),
      onRowBind: function (root) {
        $all("[data-pessoa]", root).forEach(function (row) {
          row.addEventListener("click", function () { closeDrawer(); navigate("#/pessoas/" + row.getAttribute("data-pessoa")); });
        });
      }
    });
  }
  function openPessoasRegionalDrawer(regional, cargoFiltro, tituloSufixo) {
    var list = STATE.pessoas.filter(function (p) {
      if (p.status !== "ATIVO") return false;
      if (CARGOS_PAINEL.indexOf(cargoNorm(p)) === -1) return false;
      if (normReg(p.regional) !== regional) return false;
      if (cargoFiltro && cargoNorm(p) !== cargoFiltro) return false;
      return true;
    }).slice().sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
    var rowsHtml = list.map(function (p) {
      return '<tr data-pessoa="' + p.id + '"><td class="row-primary">' + esc(p.nome) + '</td><td>' + esc(p.cargo || "—") + '</td><td>' + esc(p.empresaNome || "—") + '</td><td>' + esc(p.projeto || "—") + "</td></tr>";
    }).join("");
    openGenericTableDrawer({
      title: regional + " — " + (tituloSufixo || "Pessoas ativas"),
      subtitle: list.length + " pessoa" + (list.length !== 1 ? "s" : ""),
      theadHtml: "<th>Pessoa</th><th>Cargo</th><th>Empresa</th><th>Projeto</th>",
      rowsHtml: rowsHtml,
      exportHeaders: ["Pessoa", "Cargo", "Empresa", "Projeto"],
      exportRows: list.map(function (p) { return [p.nome || "", p.cargo || "", p.empresaNome || "", p.projeto || ""]; }),
      onRowBind: function (root) {
        $all("[data-pessoa]", root).forEach(function (row) {
          row.addEventListener("click", function () { closeDrawer(); navigate("#/pessoas/" + row.getAttribute("data-pessoa")); });
        });
      }
    });
  }
  function openCargoDrawer(cargo, titulo) {
    var list = STATE.pessoas.filter(function (p) { return p.status === "ATIVO" && cargoNorm(p) === cargo; })
      .slice().sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
    var rowsHtml = list.map(function (p) {
      return '<tr data-pessoa="' + p.id + '"><td class="row-primary">' + esc(p.nome) + '</td><td>' + esc(p.regional || "—") + '</td><td>' + esc(p.empresaNome || "—") + '</td><td>' + esc(p.projeto || "—") + "</td></tr>";
    }).join("");
    openGenericTableDrawer({
      title: titulo,
      subtitle: list.length + " pessoa" + (list.length !== 1 ? "s" : ""),
      theadHtml: "<th>Pessoa</th><th>Regional</th><th>Empresa</th><th>Projeto</th>",
      rowsHtml: rowsHtml,
      exportHeaders: ["Pessoa", "Regional", "Empresa", "Projeto"],
      exportRows: list.map(function (p) { return [p.nome || "", p.regional || "", p.empresaNome || "", p.projeto || ""]; }),
      onRowBind: function (root) {
        $all("[data-pessoa]", root).forEach(function (row) {
          row.addEventListener("click", function () { closeDrawer(); navigate("#/pessoas/" + row.getAttribute("data-pessoa")); });
        });
      }
    });
  }

  /* -- Equipes por cliente -- */
  var CLIENTES = [
    { key: "HUAWEI", nome: "Huawei", cor: "var(--danger)", logo: "/logos/logo-huawei.png" },
    { key: "ERICSSON", nome: "Ericsson", cor: "#1A1A1A", logo: "/logos/logo-ericsson.png" },
    { key: "NOKIA", nome: "Nokia", cor: "#124191", logo: "/logos/logo-nokia.png" },
    { key: "TELEFONICA", nome: "Telefónica", cor: "#7C3AED", logo: "/logos/logo-telefonica.png" }
  ];
  function projetoNorm(e) { return (e.projeto || "").trim().toUpperCase(); }
  function equipesAtivasPorCliente(clienteKey) {
    return teamLideresAtivos().filter(function (p) { return projetoNorm(p) === clienteKey; });
  }
  function clientCardsHtml() {
    return CLIENTES.map(function (c) {
      var n = equipesAtivasPorCliente(c.key).length;
      return '<div class="client-card" tabindex="0" style="--client-color:' + c.cor + ';" data-cliente="' + c.key + '" data-cliente-nome="' + esc(c.nome) + '" data-tip-title="' + esc(c.nome) + '" data-tip-sub="' + n + " equipe" + (n !== 1 ? "s" : "") + ' ativa' + (n !== 1 ? "s" : "") + '">' +
        '<img class="client-logo" src="' + c.logo + '" alt="' + esc(c.nome) + '">' +
        '<span class="client-value">' + n + "</span>" +
        '<span class="client-label">equipe' + (n !== 1 ? "s" : "") + "</span>" +
        "</div>";
    }).join("");
  }
  function openEquipesClienteDrawer(clienteKey, clienteNome) {
    var list = equipesAtivasPorCliente(clienteKey).slice().sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
    var rowsHtml = list.map(function (p) {
      return '<tr data-pessoa="' + p.id + '"><td class="row-primary">' + esc(p.nome) + '</td><td>' + esc(p.regional || "—") + '</td><td>' + esc(p.empresaNome || "—") + "</td></tr>";
    }).join("");
    openGenericTableDrawer({
      title: clienteNome + " — Equipes ativas",
      subtitle: list.length + " equipe" + (list.length !== 1 ? "s" : ""),
      theadHtml: "<th>Team Líder</th><th>Regional</th><th>Empresa</th>",
      rowsHtml: rowsHtml,
      exportHeaders: ["Team Líder", "Regional", "Empresa"],
      exportRows: list.map(function (p) { return [p.nome || "", p.regional || "", p.empresaNome || ""]; }),
      onRowBind: function (root) {
        $all("[data-pessoa]", root).forEach(function (row) {
          row.addEventListener("click", function () { closeDrawer(); navigate("#/pessoas/" + row.getAttribute("data-pessoa")); });
        });
      }
    });
  }

  function equipesAtivasPorRegionalPorCliente() {
    var map = {};
    teamLideresAtivos().forEach(function (p) {
      var reg = normReg(p.regional);
      if (!map[reg]) map[reg] = { total: 0, porCliente: {}, outros: 0 };
      map[reg].total++;
      var pj = projetoNorm(p);
      var cliente = CLIENTES.filter(function (c) { return c.key === pj; })[0];
      if (cliente) map[reg].porCliente[cliente.key] = (map[reg].porCliente[cliente.key] || 0) + 1;
      else map[reg].outros++;
    });
    return map;
  }
  function equipesRegionalStackedBarsHtml() {
    var map = equipesAtivasPorRegionalPorCliente();
    var rows = Object.keys(map).map(function (reg) {
      var r = map[reg];
      return { reg: reg, total: r.total, porCliente: r.porCliente, outros: r.outros };
    }).filter(function (r) { return r.total > 0; });
    rows.sort(function (a, b) { return b.total - a.total; });
    if (!rows.length) return '<div class="empty-state" style="padding:20px;">Nenhum dado encontrado.</div>';
    var max = rows[0].total || 1;
    var body = rows.map(function (r) {
      var pct = Math.max(6, Math.round((r.total / max) * 100));
      var segs = CLIENTES.map(function (c) {
        var n = r.porCliente[c.key] || 0;
        return n ? { key: c.key, nome: c.nome, cor: c.cor, n: n } : null;
      }).filter(Boolean);
      if (r.outros) segs.push({ key: "OUTROS", nome: "Outros", cor: "var(--border-strong)", n: r.outros });
      segs.sort(function (a, b) { return b.n - a.n; });
      var minPx = Math.max(26, segs.length * 26);
      var segHtml = segs.map(function (s) {
        return '<div class="rankbar-seg" style="flex-grow:' + s.n + ';background:' + s.cor + ';" data-seg-regional="' + esc(r.reg) + '" data-seg-cliente="' + s.key + '" data-seg-cliente-nome="' + esc(s.nome) + '" data-tip-title="' + esc(r.reg) + " — " + esc(s.nome) + '" data-tip-sub="' + s.n + " equipe" + (s.n !== 1 ? "s" : "") + '"><span>' + s.n + "</span></div>";
      }).join("");
      return '<div class="rankbar-row" tabindex="0" data-simple-bar="equipes" data-simple-bar-value="' + esc(r.reg) + '" data-tip-title="' + esc(r.reg) + '" data-tip-sub="' + r.total + " equipe" + (r.total !== 1 ? "s" : "") + '">' +
        '<div class="rankbar-label">' + esc(r.reg) + '</div>' +
        '<div class="rankbar-track"><div class="rankbar-fill client-stack" style="width:max(' + pct + '%, ' + minPx + 'px);">' + segHtml + "</div></div>" +
        '<div class="rankbar-total">' + r.total + "</div>" +
        "</div>";
    }).join("");
    var legend = '<div class="legend-row">' + CLIENTES.map(function (c) {
      return '<span class="legend-item" style="cursor:default;"><span class="legend-swatch" style="background:' + c.cor + ';"></span>' + esc(c.nome) + "</span>";
    }).join("") + '<span class="legend-item" style="cursor:default;"><span class="legend-swatch" style="background:var(--border-strong);"></span>Outros</span>' + "</div>";
    return '<div class="rankbar-list">' + body + "</div>" + legend;
  }

  function renderTreinoOverview(container) {
    var data = computeTreinoOverview();
    var tipoStatusMap = computeGroupStatusMap("tipo");
    var regionalStatusMap = computeGroupStatusMap("regional");
    var pct = data.total ? Math.round((data.byStatus.VALIDO / data.total) * 100) : 0;

    var headcountKpis = [
      ["Pessoas ativas", countPessoasAtivas(), "", ' data-headcount-nav="pessoas"'],
      ["Equipes ativas", countEquipesAtivas(), "", ' data-headcount-nav="equipes"'],
      ["Vistoriadores ativos", countPessoasAtivas("VISTORIADOR"), "", ' data-headcount-cargo="VISTORIADOR" data-headcount-title="Vistoriadores ativos"'],
      ["Técnicos ativos", countPessoasAtivas("TÉCNICO"), "", ' data-headcount-cargo="TÉCNICO" data-headcount-title="Técnicos ativos"'],
      ["Pessoas em CLEAN UP", countPessoasAtivas("CLEAN UP"), "", ' data-headcount-cargo="CLEAN UP" data-headcount-title="Pessoas em CLEAN UP (ativas)"']
    ];
    var headcountKpiHtml = headcountKpis.map(function (k) {
      return '<div class="kpi ' + k[2] + '" tabindex="0" style="cursor:pointer;"' + k[3] + '><span class="label">' + k[0] + '</span><span class="value tabular">' + k[1] + "</span></div>";
    }).join("");

    var kpis = [
      ["Em dia", pct + "%", "ok", null],
      ["A vencer (30 dias)", data.byStatus.A_VENCER, "warn", "A_VENCER"],
      ["A vencer (60 dias)", data.byStatus.A_VENCER_60, "info", "A_VENCER_60"],
      ["Vencidos", data.byStatus.VENCIDO, "danger", "VENCIDO"]
    ];
    var kpiHtml = kpis.map(function (k) {
      var clickAttrs = k[3] ? ' tabindex="0" data-status-code="' + k[3] + '" style="cursor:pointer;"' : "";
      return '<div class="kpi ' + k[2] + '"' + clickAttrs + '><span class="label">' + k[0] + '</span><span class="value tabular">' + k[1] + "</span></div>";
    }).join("");

    container.innerHTML =
      '<div class="panel"><div class="panel-head"><h3>Equipes por cliente</h3><span class="hint">clique para ver as equipes</span></div><div class="panel-body pad"><div class="client-cards">' + clientCardsHtml() + "</div></div></div>" +
      '<div class="kpi-row">' + headcountKpiHtml + "</div>" +
      '<div class="kpi-row">' + kpiHtml + "</div>" +
      '<div class="panel"><div class="panel-head"><h3>Distribuição por status</h3><span class="hint">clique para ver as pessoas</span></div><div class="panel-body pad">' + statusBarLgHtml(data.byStatus, data.total) + "</div></div>" +
      '<div class="viz-grid">' +
      '<div class="panel"><div class="panel-head"><h3>Pendências por item</h3><span class="hint">clique numa linha para ver as pessoas</span></div><div class="panel-body pad">' + statusBarsHtml(tipoStatusMap, "tipo") + "</div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Pendências por regional</h3><span class="hint">clique numa linha para ver as pessoas</span></div><div class="panel-body pad">' + statusBarsHtml(regionalStatusMap, "regional") + "</div></div>" +
      "</div>" +
      '<div class="viz-grid-3">' +
      '<div class="panel"><div class="panel-head"><h3>Equipes ativas por regional</h3><span class="hint">clique para ver as equipes</span></div><div class="panel-body pad">' + equipesRegionalStackedBarsHtml() + "</div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Pessoas ativas por regional</h3><span class="hint">clique para ver as pessoas</span></div><div class="panel-body pad">' + simpleBarsHtml(pessoasAtivasPorRegional(), "pessoas") + "</div></div>" +
      '<div class="panel"><div class="panel-head"><h3>Técnicos ativos por regional</h3><span class="hint">clique para ver as pessoas</span></div><div class="panel-body pad">' + simpleBarsHtml(pessoasAtivasPorRegional("TÉCNICO"), "tecnicos") + "</div></div>" +
      "</div>";

    bindTooltips(container);
    $all("[data-group-bar]", container).forEach(function (el) {
      el.addEventListener("click", function (ev) {
        var segEl = ev.target.closest("[data-status-bar]");
        openGroupPendenciaDrawer(el.getAttribute("data-group-kind"), el.getAttribute("data-group-bar"), segEl ? segEl.getAttribute("data-status-bar") : null);
      });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); el.click(); }
      });
    });
    $all("[data-status-code]", container).forEach(function (el) {
      el.addEventListener("click", function () { openStatusOverviewDrawer(el.getAttribute("data-status-code")); });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); el.click(); }
      });
    });
    $all("[data-simple-bar]", container).forEach(function (el) {
      el.addEventListener("click", function (ev) {
        var kind = el.getAttribute("data-simple-bar");
        var val = el.getAttribute("data-simple-bar-value");
        if (kind === "equipes") {
          var segEl = ev.target.closest("[data-seg-cliente]");
          if (segEl) openEquipesRegionalClienteDrawer(segEl.getAttribute("data-seg-regional"), segEl.getAttribute("data-seg-cliente"), segEl.getAttribute("data-seg-cliente-nome"));
          else openEquipesRegionalDrawer(val);
        }
        else if (kind === "pessoas") openPessoasRegionalDrawer(val, null, "Pessoas ativas");
        else if (kind === "tecnicos") openPessoasRegionalDrawer(val, "TÉCNICO", "Técnicos ativos");
      });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); el.click(); }
      });
    });
    $all("[data-headcount-cargo]", container).forEach(function (el) {
      el.addEventListener("click", function () { openCargoDrawer(el.getAttribute("data-headcount-cargo"), el.getAttribute("data-headcount-title")); });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); el.click(); }
      });
    });
    $all("[data-headcount-nav]", container).forEach(function (el) {
      el.addEventListener("click", function () { navigate("#/" + el.getAttribute("data-headcount-nav")); });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); el.click(); }
      });
    });
    $all("[data-cliente]", container).forEach(function (el) {
      el.addEventListener("click", function () { openEquipesClienteDrawer(el.getAttribute("data-cliente"), el.getAttribute("data-cliente-nome")); });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); el.click(); }
      });
    });
  }

  /* ================================================================
     TREINAMENTOS
     ================================================================ */
  function renderTreinamentosList(main) {
    main.innerHTML =
      '<div class="topbar"><div><h1>Painel</h1><div class="sub">Visão geral de pessoas, equipes e treinamentos de segurança</div></div>' +
      (canDo("documentos", "criar") ? '<button class="btn primary" id="btn-new-tr">' + ICONS.plus + "Novo registro</button>" : "") + "</div>" +
      '<div id="treino-overview"></div>';

    if ($("#btn-new-tr")) $("#btn-new-tr").addEventListener("click", function () { openTreinamentoForm(null, null); });

    renderTreinoOverview($("#treino-overview"));
  }

  function renderTreinamentoDetail(main, id) {
    var t = byId(STATE.treinamentos, id);
    if (!t) { navigate("#/treinamentos"); return; }
    var st = trainingStatus(t);
    var pessoa = t.pessoaId ? byId(STATE.pessoas, t.pessoaId) : null;
    main.innerHTML =
      '<div class="topbar"><div><button class="link-btn" id="back-btn">← Painel</button><h1 style="margin-top:6px;">' + esc(t.tipo) + "</h1>" +
      '<div class="sub">' + esc(t.pessoaNome) + " · " + pill(st) + "</div>" +
      '<div class="header-field-notes">' + fieldNoteHtml("tipo", "Tipo") + "</div>" +
      "</div>" +
      '<div style="display:flex;gap:8px;">' +
      (canDo("documentos", "editar") ? '<button class="btn" id="btn-edit-tr">Editar</button>' : "") +
      (canDo("documentos", "excluir") ? '<button class="btn danger" id="btn-del-tr">' + ICONS.trash + "Excluir</button>" : "") +
      "</div></div>" +
      '<div class="panel"><div class="panel-body pad"><div class="detail-grid">' +
      detailItem("Pessoa", t.pessoaNome) + detailItem("Categoria", t.categoria, "categoria") +
      detailItem("Emissão", fmtDateBR(t.dataEmissao), "data_emissao") + detailItem("Vencimento", fmtDateBR(t.vencimento), "vencimento") + detailItem("Situação registrada", t.situacaoOriginal, "situacao_original") +
      "</div>" + (t.observacao ? '<div class="detail-item" style="margin-top:12px;"><span class="k">Observação</span><span class="v">' + esc(t.observacao) + "</span>" + fieldNoteHtml("observacao") + "</div>" : "") +
      '<div style="margin-top:16px;">' +
      (t.arquivoPath
        ? '<button type="button" class="file-chip" id="btn-ver-anexo">' + ICONS.file + esc(t.arquivoNome || "Ver anexo") + "</button>"
        : '<div class="hint">Nenhum arquivo anexado a este registro.</div>') +
      "</div></div></div>" +
      historyPanelHtml("treinamento", t.id);
    loadHistoryPanel("treinamento", t.id);
    $("#back-btn").addEventListener("click", function () { navigate("#/treinamentos"); });
    if ($("#btn-edit-tr")) $("#btn-edit-tr").addEventListener("click", function () { openTreinamentoForm(t, null); });
    if ($("#btn-del-tr")) $("#btn-del-tr").addEventListener("click", function () { confirmDelete("treinamento", t.id, t.tipo + " — " + t.pessoaNome); });
    if ($("#btn-ver-anexo")) $("#btn-ver-anexo").addEventListener("click", function () { openAnexo(t.id); });
  }

  // Anexos não ficam mais embutidos como data URI no registro — o Storage é
  // privado, então toda visualização passa por um link assinado de 60s
  // (GET /api/treinamentos/:id/arquivo). Sem cache: se o link expirar antes
  // de ser aberto, é só clicar de novo.
  function openAnexo(id) {
    apiFetch("/api/treinamentos/" + id + "/arquivo")
      .then(function (data) { window.open(data.url, "_blank", "noopener"); })
      .catch(handleApiError);
  }

  function openTreinamentoForm(t, presetPessoaId) {
    var isNew = !t;
    var pessoasOpts = STATE.pessoas.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); })
      .map(function (p) { return '<option value="' + p.id + '"' + ((t && t.pessoaId === p.id) || presetPessoaId === p.id ? " selected" : "") + '>' + esc(p.nome) + "</option>"; }).join("");
    var tipoKnown = t && TIPOS.some(function (x) { return x[0] === t.tipo; });
    var tipoOpts = TIPOS.map(function (ti) { return '<option value="' + esc(ti[0]) + '" data-cat="' + ti[1] + '"' + (t && t.tipo === ti[0] ? " selected" : "") + '>' + esc(ti[0]) + "</option>"; }).join("")
      + '<option value="__outro__"' + (t && !tipoKnown ? " selected" : "") + '>Outro (especificar)</option>';

    var html =
      '<div class="drawer-head"><div><h2>' + (isNew ? "Novo registro" : "Editar registro") + '</h2><div class="sub">Treinamento ou documento de segurança</div></div>' +
      '<button class="btn ghost sm" id="drawer-close">' + ICONS.close + "</button></div>" +
      '<form class="drawer-body" id="tr-form"><div class="field-grid">' +
      '<div class="field span2"><label>Pessoa *</label><select name="pessoaId" required>' + (presetPessoaId || (t && t.pessoaId) ? "" : '<option value="">Selecione…</option>') + pessoasOpts + "</select></div>" +
      '<div class="field"><label>Item *</label><select name="tipo" id="tr-tipo-select" required>' + tipoOpts + "</select></div>" +
      '<div class="field" id="tr-tipo-outro-wrap" style="display:' + (t && !TIPOS.some(function (x) { return x[0] === t.tipo; }) ? "flex" : "none") + '"><label>Especifique o item</label><input type="text" name="tipoOutro" value="' + (t ? esc(t.tipo) : "") + '"></div>' +
      selectField("Categoria", "categoria", ["treinamento", "documento"], t ? t.categoria : "treinamento") +
      field("Emissão", "dataEmissao", "date", t) + field("Vencimento", "vencimento", "date", t) +
      '<div class="field"><label>Situação (se sem vencimento)</label><select name="situacaoOriginal"><option value="">—</option><option value="VALIDO"' + (t && t.situacaoOriginal === "VALIDO" ? " selected" : "") + '>Válido</option><option value="RENOVAR"' + (t && t.situacaoOriginal === "RENOVAR" ? " selected" : "") + '>Renovar</option><option value="VENCIDO"' + (t && t.situacaoOriginal === "VENCIDO" ? " selected" : "") + '>Vencido</option></select></div>' +
      '<div class="field span2"><label>Observação</label><textarea name="observacao">' + esc(t ? t.observacao : "") + "</textarea></div>" +
      '<div class="field span2"><label>Arquivo anexado</label>' +
      (t && t.arquivoPath ? '<div style="margin-bottom:8px;"><button type="button" class="file-chip" id="tr-form-ver-anexo">' + ICONS.file + esc(t.arquivoNome || "Ver anexo") + '</button> <label style="margin-left:8px;"><input type="checkbox" name="removerArquivo"> remover anexo</label></div>' : "") +
      '<label class="dropzone" id="dropzone"><input type="file" name="arquivo" id="tr-file-input">' + ICONS.upload + '<div id="dropzone-label">Clique para anexar um arquivo (PDF, imagem ou documento)</div></label>' +
      "</div>" +
      "</div></form>" +
      '<div class="drawer-foot"><span></span><div style="display:flex;gap:8px;"><button type="button" class="btn" id="drawer-cancel">Cancelar</button><button type="submit" form="tr-form" class="btn primary">' + ICONS.check + "Salvar</button></div></div>";

    openDrawer(html);
    var tipoSelect = $("#tr-tipo-select");
    tipoSelect.addEventListener("change", function () {
      $("#tr-tipo-outro-wrap").style.display = tipoSelect.value === "__outro__" ? "flex" : "none";
      var opt = tipoSelect.options[tipoSelect.selectedIndex];
      var cat = opt.getAttribute("data-cat");
      if (cat) { var catSel = $('select[name="categoria"]', $("#tr-form")); if (catSel) catSel.value = cat; }
    });
    $("#tr-file-input").addEventListener("change", function () {
      var f = this.files[0];
      $("#dropzone-label").textContent = f ? f.name : "Clique para anexar um arquivo (PDF, imagem ou documento)";
    });
    if ($("#tr-form-ver-anexo")) $("#tr-form-ver-anexo").addEventListener("click", function () { openAnexo(t.id); });

    $("#tr-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!canDo("documentos", isNew ? "criar" : "editar")) { toast("Você não tem permissão para isso.", "error"); return; }
      var fd = new FormData(ev.target);
      var pid = Number(fd.get("pessoaId"));
      var pessoa = byId(STATE.pessoas, pid);
      if (!pessoa) { toast("Selecione a pessoa.", "error"); return; }
      var tipoVal = fd.get("tipo");
      if (tipoVal === "__outro__") tipoVal = (fd.get("tipoOutro") || "").toString().trim() || "OUTRO";
      if (!tipoVal) { toast("Informe o item do treinamento/documento.", "error"); return; }

      var body = {
        pessoaId: pid,
        tipo: tipoVal,
        categoria: fd.get("categoria") || "treinamento",
        vencimento: emptyToNull((fd.get("vencimento") || "").toString()),
        dataEmissao: emptyToNull((fd.get("dataEmissao") || "").toString()),
        situacaoOriginal: (fd.get("situacaoOriginal") || "").toString(),
        observacao: (fd.get("observacao") || "").toString().trim()
      };

      var removerArquivo = fd.get("removerArquivo");
      var fileInput = $("#tr-file-input");
      var newFile = fileInput.files[0];
      if (newFile && newFile.size > 5 * 1024 * 1024) { toast("Arquivo muito grande (máx. 5MB).", "error"); return; }

      var baseReq = isNew
        ? apiFetch("/api/treinamentos", { method: "POST", body: body })
        : apiFetch("/api/treinamentos/" + t.id, { method: "PATCH", body: body });

      baseReq.then(function (data) {
        var rec = mapTreinamentoFromApi(data);
        var attachStep;
        if (newFile) {
          var upFd = new FormData();
          upFd.append("file", newFile);
          attachStep = apiFetch("/api/treinamentos/" + rec.id + "/arquivo", { method: "POST", body: upFd, isFormData: true })
            .then(function (afterFile) { rec = mapTreinamentoFromApi(afterFile); });
        } else if (removerArquivo && rec.arquivoPath) {
          attachStep = apiFetch("/api/treinamentos/" + rec.id + "/arquivo", { method: "DELETE" })
            .then(function (afterRemove) { rec = mapTreinamentoFromApi(afterRemove); });
        } else {
          attachStep = Promise.resolve();
        }
        return attachStep.then(function () {
          if (isNew) STATE.treinamentos.push(rec);
          else {
            var idx = STATE.treinamentos.findIndex(function (x) { return x.id === rec.id; });
            if (idx !== -1) STATE.treinamentos[idx] = rec;
          }
          closeDrawer();
          render();
          renderShellCounts();
          toast(isNew ? "Registro criado." : "Registro atualizado.", "success");
          // Editar (de onde quer que tenha sido aberto — da própria pessoa ou da
          // tela do item) e criar a partir da pessoa continuam na mesma tela: só
          // um novo registro criado sem pessoa pré-selecionada (pela lista geral
          // de Treinamentos) é que leva para a tela do item recém-criado.
          if (isNew && !presetPessoaId) navigate("#/treinamentos/" + rec.id);
        });
      }).catch(handleApiError);
    });
    $("#drawer-close").addEventListener("click", closeDrawer);
    $("#drawer-cancel").addEventListener("click", closeDrawer);
  }

  /* ---------------- Delete flow ---------------- */
  function confirmDelete(kind, id, label) {
    var pageKey = kind === "pessoa" ? "pessoas" : kind === "equipe" ? "equipes" : kind === "empresa" ? "empresas" : "documentos";
    if (!canDo(pageKey, "excluir")) { toast("Você não tem permissão para excluir.", "error"); return; }
    var html =
      '<div class="modal-box"><h3>Excluir registro?</h3><p>Tem certeza que deseja excluir <strong>' + esc(label) + '</strong>? Esta ação não pode ser desfeita.</p>' +
      '<div class="modal-actions"><button type="button" class="btn" id="modal-cancel">Cancelar</button><button type="button" class="btn danger" id="modal-confirm">' + ICONS.trash + "Excluir</button></div></div>";
    openModal(html);
    $("#modal-cancel").addEventListener("click", closeModal);
    $("#modal-confirm").addEventListener("click", function () {
      var endpoint = kind === "pessoa" ? "/api/pessoas/" + id
        : kind === "equipe" ? "/api/equipes/" + id
        : kind === "empresa" ? "/api/empresas/" + id
        : "/api/treinamentos/" + id;
      apiFetch(endpoint, { method: "DELETE" }).then(function () {
        // Espelha localmente a cascata que o banco já faz no servidor, pra
        // atualizar a tela sem precisar recarregar tudo de /api/state.
        if (kind === "pessoa") {
          STATE.pessoas = STATE.pessoas.filter(function (p) { return p.id !== id; });
          STATE.equipes.forEach(function (e) {
            e.membros = e.membros.filter(function (m) { return m.pessoaId !== id; });
            if (e.teamLiderId === id) { e.teamLiderId = null; }
          });
          STATE.treinamentos = STATE.treinamentos.filter(function (tr) { return tr.pessoaId !== id; });
        } else if (kind === "equipe") {
          STATE.equipes = STATE.equipes.filter(function (e) { return e.id !== id; });
        } else if (kind === "empresa") {
          STATE.empresas = STATE.empresas.filter(function (e) { return e.id !== id; });
          STATE.pessoas.forEach(function (p) { if (p.empresaId === id) { p.empresaId = null; p.empresaNome = null; } });
        } else if (kind === "treinamento") {
          STATE.treinamentos = STATE.treinamentos.filter(function (t) { return t.id !== id; });
        }
        closeModal();
        renderShellCounts();
        toast("Registro excluído.", "success");
        navigate("#/" + kind + "s");
      }).catch(function (err) {
        closeModal();
        handleApiError(err);
      });
    });
  }

  /* ================================================================
     ADMINISTRADOR — usuários, permissões e log de alterações
     ================================================================ */
  function adminTabsHtml(active) {
    return '<div class="section-tabs" style="margin-bottom:16px;">' +
      '<button type="button" class="section-tab' + (active === "usuarios" ? " active" : "") + '" data-admintab="usuarios">Usuários</button>' +
      '<button type="button" class="section-tab' + (active === "log" ? " active" : "") + '" data-admintab="log">Log de alterações</button>' +
      '<button type="button" class="section-tab' + (active === "listas" ? " active" : "") + '" data-admintab="listas">Listas</button>' +
      '<button type="button" class="section-tab' + (active === "sync" ? " active" : "") + '" data-admintab="sync">Sincronização GPO</button>' +
      "</div>";
  }
  var ADMIN_TAB_ROUTES = { usuarios: "#/admin", log: "#/admin/log", listas: "#/admin/listas", sync: "#/admin/sync" };
  function bindAdminTabs(main) {
    $all("[data-admintab]", main).forEach(function (btn) {
      btn.addEventListener("click", function () { navigate(ADMIN_TAB_ROUTES[btn.getAttribute("data-admintab")] || "#/admin"); });
    });
  }

  function byUuid(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function renderAdminUsuarios(main) {
    main.innerHTML =
      '<div class="topbar"><div><h1>Administrador</h1><div class="sub">Usuários, permissões e histórico de alterações</div></div>' +
      '<button class="btn primary" id="btn-new-user">' + ICONS.plus + "Novo usuário</button></div>" +
      adminTabsHtml("usuarios") +
      '<div id="admin-usuarios-body"><div class="hint" style="padding:20px;">Carregando…</div></div>';
    bindAdminTabs(main);

    function reload() {
      apiFetch("/api/usuarios").then(function (data) {
        var container = $("#admin-usuarios-body");
        if (!container) return; // usuário já navegou pra outra tela enquanto carregava
        var usuarios = (data.usuarios || []).map(mapUsuarioFromApi).sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
        var body = usuarios.map(function (u) {
          return '<tr data-uid="' + u.id + '">' +
            '<td><div class="row-primary">' + esc(u.nome) + '</div><div class="row-secondary">' + esc(u.email) + "</div></td>" +
            "<td>" + (u.role === "admin" ? '<span class="tag">Administrador</span>' : "Usuário") + "</td>" +
            "<td>" + (u.ativo ? '<span class="pill ok">Ativo</span>' : '<span class="pill neutral">Inativo</span>') + (u.mustChangePassword ? ' <span class="hint">(senha temporária)</span>' : "") + "</td>" +
            "<td>" + (u.ultimoLoginEm ? fmtDateHoraBR(u.ultimoLoginEm) : '<span class="hint">nunca entrou</span>') + "</td>" +
            '<td style="text-align:right;white-space:nowrap;">' +
            '<button class="btn ghost sm" data-edit-user="' + u.id + '">Editar</button> ' +
            '<button class="btn ghost sm" data-reset-user="' + u.id + '">' + ICONS.lock + "Senha</button> " +
            '<button class="btn ghost sm" data-toggle-user="' + u.id + '">' + (u.ativo ? "Desativar" : "Ativar") + "</button>" +
            "</td></tr>";
        }).join("");

        container.innerHTML = '<div class="panel"><div class="table-scroll"><table class="data"><thead><tr><th>Nome / E-mail</th><th>Papel</th><th>Status</th><th>Último login</th><th></th></tr></thead><tbody>' + body + "</tbody></table></div></div>";

        $all("[data-edit-user]", container).forEach(function (btn) {
          btn.addEventListener("click", function () { openUsuarioForm(byUuid(usuarios, btn.getAttribute("data-edit-user")), reload); });
        });
        $all("[data-reset-user]", container).forEach(function (btn) {
          btn.addEventListener("click", function () { openResetSenhaModal(byUuid(usuarios, btn.getAttribute("data-reset-user"))); });
        });
        $all("[data-toggle-user]", container).forEach(function (btn) {
          btn.addEventListener("click", function () {
            var u = byUuid(usuarios, btn.getAttribute("data-toggle-user"));
            if (!u) return;
            if (u.id === CURRENT_USER.id) { toast("Você não pode desativar sua própria conta.", "error"); return; }
            if (u.ativo && u.role === "admin") {
              var outrosAdmins = usuarios.filter(function (x) { return x.role === "admin" && x.id !== u.id && x.ativo; });
              if (!outrosAdmins.length) { toast("Não é possível desativar o único administrador ativo.", "error"); return; }
            }
            apiFetch("/api/usuarios/" + u.id, { method: "PATCH", body: { ativo: !u.ativo } })
              .then(function () { reload(); })
              .catch(handleApiError);
          });
        });
      }).catch(handleApiError);
    }
    $("#btn-new-user").addEventListener("click", function () { openUsuarioForm(null, reload); });
    reload();
  }

  function openUsuarioForm(u, onSaved) {
    var isNew = !u;
    var permHtml = PAGES.map(function (pg) {
      return "<tr><td class=\"row-primary\">" + esc(pg.label) + "</td>" + ACTIONS.map(function (ac) {
        var checked = u && u.permissoes && u.permissoes[pg.key] && u.permissoes[pg.key][ac.key];
        return '<td style="text-align:center;"><input type="checkbox" name="perm_' + pg.key + "_" + ac.key + '"' + (checked ? " checked" : "") + "></td>";
      }).join("") + "</tr>";
    }).join("");

    var html =
      '<div class="drawer-head"><div><h2>' + (isNew ? "Novo usuário" : "Editar usuário") + '</h2><div class="sub">Acesso e permissões</div></div>' +
      '<button class="btn ghost sm" id="drawer-close">' + ICONS.close + "</button></div>" +
      '<form class="drawer-body" id="usuario-form"><div class="field-grid">' +
      field("Nome completo *", "nome", "text", u, { required: true, span2: true }) +
      '<div class="field span2"><label>E-mail *</label><input type="email" name="email" value="' + esc(u ? u.email : "") + '"' + (isNew ? " required" : " disabled") + ">" +
      (isNew ? "" : '<div class="hint" style="margin-top:4px;">O e-mail não pode ser alterado depois que o usuário é criado.</div>') + "</div>" +
      '<div class="field"><label>Papel</label><select name="role"><option value="usuario"' + (u && u.role === "usuario" ? " selected" : "") + '>Usuário</option><option value="admin"' + (u && u.role === "admin" ? " selected" : "") + ">Administrador</option></select></div>" +
      (isNew ? '<div class="field"><label>Senha inicial *</label><input type="text" name="senhaInicial" required minlength="6" placeholder="Defina a senha temporária"></div>' : "") +
      "</div>" +
      '<div class="hint" style="margin:14px 0 6px;">Permissões por página (ignoradas se o papel for Administrador — administradores têm acesso completo)</div>' +
      '<div class="table-scroll"><table class="data perm-table"><thead><tr><th>Página</th>' + ACTIONS.map(function (ac) { return '<th style="text-align:center;">' + esc(ac.label) + "</th>"; }).join("") + "</tr></thead><tbody>" + permHtml + "</tbody></table></div>" +
      "</form>" +
      '<div class="drawer-foot"><span></span><div style="display:flex;gap:8px;"><button type="button" class="btn" id="drawer-cancel">Cancelar</button><button type="submit" form="usuario-form" class="btn primary">' + ICONS.check + "Salvar</button></div></div>";
    openDrawer(html, { wide: true });

    $("#usuario-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      var nome = (fd.get("nome") || "").toString().trim();
      var email = (fd.get("email") || "").toString().trim().toLowerCase();
      var role = fd.get("role") === "admin" ? "admin" : "usuario";
      if (!nome || (isNew && !email)) { toast("Preencha nome e e-mail.", "error"); return; }

      var permissoes = defaultPermissoes(false);
      PAGES.forEach(function (pg) { ACTIONS.forEach(function (ac) { permissoes[pg.key][ac.key] = !!fd.get("perm_" + pg.key + "_" + ac.key); }); });

      if (isNew) {
        var senhaInicial = (fd.get("senhaInicial") || "").toString();
        if (senhaInicial.length < 6) { toast("A senha inicial deve ter pelo menos 6 caracteres.", "error"); return; }
        apiFetch("/api/usuarios", { method: "POST", body: { nome: nome, email: email, senha: senhaInicial, role: role, permissoes: permissoes } })
          .then(function () {
            closeDrawer();
            toast("Usuário criado. Informe a senha inicial para ele(a) — será exigida a troca no primeiro login.", "success");
            if (onSaved) onSaved();
          })
          .catch(handleApiError);
      } else {
        apiFetch("/api/usuarios/" + u.id, { method: "PATCH", body: { nome: nome, role: role, permissoes: permissoes } })
          .then(function () {
            closeDrawer();
            toast("Usuário atualizado.", "success");
            if (onSaved) onSaved();
          })
          .catch(handleApiError);
      }
    });
    $("#drawer-close").addEventListener("click", closeDrawer);
    $("#drawer-cancel").addEventListener("click", closeDrawer);
  }

  function openResetSenhaModal(u) {
    if (!u) return;
    var html = '<div class="modal-box"><h3>Redefinir senha</h3><p>Defina uma nova senha temporária para <strong>' + esc(u.nome) + "</strong>. Ele(a) precisará trocá-la no próximo login.</p>" +
      '<form id="reset-senha-form" class="field-grid one">' +
      '<div class="field"><label>Nova senha temporária *</label><input type="text" name="senha" required minlength="6"></div>' +
      '<div class="modal-actions"><button type="button" class="btn" id="modal-cancel">Cancelar</button><button type="submit" class="btn primary">Redefinir</button></div>' +
      "</form></div>";
    openModal(html);
    $("#reset-senha-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      var senha = (fd.get("senha") || "").toString();
      if (senha.length < 6) { toast("Mínimo de 6 caracteres.", "error"); return; }
      apiFetch("/api/usuarios/" + u.id + "/reset-senha", { method: "POST", body: { novaSenhaTemporaria: senha } })
        .then(function () {
          closeModal();
          toast("Senha redefinida.", "success");
        })
        .catch(handleApiError);
    });
    $("#modal-cancel").addEventListener("click", closeModal);
  }

  var PAGE_SIZE_LOG = 50;
  var LOG_EXPORT_CAP = 200;

  function renderAdminLog(main) {
    uiState.adminLog = uiState.adminLog || { q: "", entidade: "", page: 1 };
    var ui = uiState.adminLog;
    var entidadeLabels = { pessoa: "Pessoa", equipe: "Equipe", empresa: "Empresa", treinamento: "Documento", usuario: "Usuário", lista: "Lista" };

    function fetchLog(page, pageSize) {
      var params = "?page=" + page + "&pageSize=" + pageSize;
      if (ui.entidade) params += "&entidade=" + encodeURIComponent(ui.entidade);
      if (ui.q) params += "&q=" + encodeURIComponent(ui.q);
      return apiFetch("/api/audit-log" + params);
    }

    function draw() {
      withFocusPreserved(function () { drawInto(); });
    }

    function drawInto() {
      var body2 = $("#admin-log-body");
      if (body2) body2.innerHTML = '<div class="hint" style="padding:20px;">Carregando…</div>';
      fetchLog(ui.page, PAGE_SIZE_LOG).then(function (data) {
        body2 = $("#admin-log-body");
        if (!body2) return;
        var rows = (data.rows || []).map(mapAuditRow);
        var totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || PAGE_SIZE_LOG)));
        ui.page = Math.min(ui.page, totalPages);
        var body = rows.map(function (a) {
          var acaoLabel = a.acao === "criar" ? "Criado" : a.acao === "excluir" ? "Excluído" : "Editado";
          return "<tr>" +
            '<td class="mono">' + fmtDateHoraBR(a.ts) + "</td>" +
            "<td>" + esc(a.usuarioNome) + "</td>" +
            '<td><span class="tag">' + esc(entidadeLabels[a.entidade] || a.entidade) + "</span></td>" +
            "<td>" + esc(a.entidadeLabel || "—") + "</td>" +
            "<td>" + acaoLabel + (a.campoLabel ? " · " + esc(a.campoLabel) : "") + "</td>" +
            "<td>" + (a.campo ? esc(a.de || "—") + " → " + esc(a.para || "—") : "—") + "</td>" +
            "</tr>";
        }).join("");
        var toolbar =
          '<div class="search-wrap">' + ICONS.search + '<input type="text" id="log-q" placeholder="Buscar por registro, campo, valor…" value="' + esc(ui.q) + '"></div>' +
          '<select class="filter" id="log-entidade"><option value="">Todos os tipos</option>' +
          Object.keys(entidadeLabels).map(function (k) { return '<option value="' + k + '"' + (ui.entidade === k ? " selected" : "") + '>' + entidadeLabels[k] + "</option>"; }).join("") + "</select>" +
          '<button class="btn ghost sm" id="log-export">' + ICONS.download + "Exportar</button>";

        body2.innerHTML = tableShell({
          toolbar: toolbar,
          headHtml: "<th>Quando</th><th>Usuário</th><th>Tipo</th><th>Registro</th><th>Ação</th><th>Alteração</th>",
          bodyHtml: body, count: data.total || 0, page: ui.page, totalPages: totalPages,
          empty: "Nenhuma alteração registrada ainda."
        });
        $("#log-q").addEventListener("input", debounce(function (e) { ui.q = e.target.value; ui.page = 1; draw(); }, 250));
        $("#log-entidade").addEventListener("change", function (e) { ui.entidade = e.target.value; ui.page = 1; draw(); });
        $("#log-export").addEventListener("click", function () {
          fetchLog(1, LOG_EXPORT_CAP).then(function (data2) {
            var rows2 = (data2.rows || []).map(mapAuditRow);
            var headers = ["Quando", "Usuário", "Tipo", "Registro", "Ação", "Campo", "De", "Para"];
            var exportRows = rows2.map(function (a) {
              var acaoLabel = a.acao === "criar" ? "Criado" : a.acao === "excluir" ? "Excluído" : "Editado";
              return [fmtDateHoraBR(a.ts), a.usuarioNome, entidadeLabels[a.entidade] || a.entidade, a.entidadeLabel || "", acaoLabel, a.campoLabel || "", a.de || "", a.para || ""];
            });
            if ((data2.total || 0) > LOG_EXPORT_CAP) {
              toast("Exportando os " + LOG_EXPORT_CAP + " registros mais recentes que casam com o filtro (de " + data2.total + " no total).", "success");
            }
            downloadRowsAsXls("log_alteracoes", headers, exportRows);
          }).catch(handleApiError);
        });
        $all("[data-page]", body2).forEach(function (btn) {
          btn.addEventListener("click", function () {
            ui.page = btn.getAttribute("data-page") === "prev" ? Math.max(1, ui.page - 1) : Math.min(totalPages, ui.page + 1);
            draw();
          });
        });
      }).catch(handleApiError);
    }

    main.innerHTML =
      '<div class="topbar"><div><h1>Administrador</h1><div class="sub">Usuários, permissões e histórico de alterações</div></div></div>' +
      adminTabsHtml("log") +
      '<div id="admin-log-body"></div>';
    bindAdminTabs(main);
    draw();
  }

  /* ---------------- Sincronização com o GPO ---------------- */
  function renderAdminSync(main) {
    var statusLabels = { sucesso: "Sucesso", erro: "Erro", em_andamento: "Em andamento" };
    var statusPill = { sucesso: "ok", erro: "danger", em_andamento: "neutral" };

    function resumoHtml(r) {
      if (!r) return "";
      return '<ul style="margin:8px 0 0 18px;padding:0;">' +
        "<li>Empresas: " + r.empresas.total + " sincronizadas" + (r.empresas.erros ? " (" + r.empresas.erros + " com erro)" : "") + "</li>" +
        "<li>Pessoas: " + r.pessoas.total + " sincronizadas" + (r.pessoas.erros ? " (" + r.pessoas.erros + " com erro)" : "") + "</li>" +
        "<li>Equipes: " + r.equipes.totalEquipes + " equipes, " + r.equipes.totalMembros + " membros" + (r.equipes.membrosOrfaos ? " (" + r.equipes.membrosOrfaos + " membros ignorados por pessoa inexistente)" : "") + "</li>" +
        "<li>Treinamentos: " + r.treinamentos.totalFinal + " registros (" + r.treinamentos.duplicadosRemovidos + " duplicados removidos" + (r.treinamentos.orfaos ? ", " + r.treinamentos.orfaos + " ignorados por pessoa inexistente" : "") +
          (r.treinamentos.tiposDesconhecidos && r.treinamentos.tiposDesconhecidos.length ? ", tipos desconhecidos: " + r.treinamentos.tiposDesconhecidos.map(esc).join(", ") : "") + ")</li>" +
        "</ul>";
    }

    function draw() {
      var body = $("#admin-sync-body");
      if (!body) return;
      body.innerHTML = '<div class="hint" style="padding:20px;">Carregando…</div>';
      apiFetch("/api/sync/gpo").then(function (data) {
        body = $("#admin-sync-body");
        if (!body) return;
        var logs = data.logs || [];
        var rows = logs.map(function (l) {
          return "<tr>" +
            '<td class="mono">' + fmtDateHoraBR(l.iniciado_em) + "</td>" +
            "<td>" + esc(l.origem || "—") + "</td>" +
            '<td><span class="pill ' + (statusPill[l.status] || "neutral") + '">' + (statusLabels[l.status] || l.status) + "</span></td>" +
            "<td>" + (l.status === "erro" ? esc(l.erro || "") : resumoHtml(l.resumo)) + "</td>" +
            "</tr>";
        }).join("");
        body.innerHTML = '<div class="panel"><div class="table-scroll"><table class="data"><thead><tr><th>Quando</th><th>Origem</th><th>Status</th><th>Resultado</th></tr></thead><tbody>' +
          (rows || '<tr><td colspan="4" class="hint" style="padding:20px;">Nenhuma sincronização ainda.</td></tr>') + "</tbody></table></div></div>";
      }).catch(handleApiError);
    }

    main.innerHTML =
      '<div class="topbar"><div><h1>Administrador</h1><div class="sub">Usuários, permissões e histórico de alterações</div></div></div>' +
      adminTabsHtml("sync") +
      '<div class="panel" style="padding:16px;margin-bottom:16px;">' +
      "<p>Traz os dados mais recentes do GPO (pessoas, empresas, equipes e treinamentos) direto pro Controle Eolen. " +
      "Roda sozinho todo dia de madrugada — use o botão abaixo se quiser trazer uma atualização na hora.</p>" +
      '<button class="btn primary" id="btn-sync-now" style="margin-top:10px;">Sincronizar agora</button>' +
      '<span id="sync-now-status" class="hint" style="margin-left:12px;"></span>' +
      "</div>" +
      '<div id="admin-sync-body"></div>';
    bindAdminTabs(main);
    draw();

    $("#btn-sync-now").addEventListener("click", function () {
      var btn = $("#btn-sync-now");
      var statusEl = $("#sync-now-status");
      btn.disabled = true;
      statusEl.textContent = "Sincronizando… isso pode levar alguns segundos.";
      apiFetch("/api/sync/gpo", { method: "POST" }).then(function () {
        statusEl.textContent = "";
        toast("Sincronização concluída.", "success");
        draw();
      }).catch(function (err) {
        statusEl.textContent = "";
        handleApiError(err);
      }).finally(function () {
        btn.disabled = false;
      });
    });
  }

  function renderAdminListas(main) {
    ensureListasSeed();
    uiState.adminListas = uiState.adminListas || { key: LISTAS_META[0].key };
    var ui = uiState.adminListas;

    function draw() {
      var meta = listaMeta(ui.key) || LISTAS_META[0];
      var items = (STATE.listas[meta.key] || []).slice();

      var subtabs = LISTAS_META.map(function (m) {
        return '<button type="button" class="section-tab' + (m.key === meta.key ? " active" : "") + '" data-listakey="' + m.key + '">' + esc(m.label) + "</button>";
      }).join("");

      var chips = items.length ? items.map(function (v) {
        return '<span class="list-chip">' + esc(v) + (items.length > 1 ? '<button type="button" data-remove-opt="' + esc(v) + '" title="Remover opção">' + ICONS.close + "</button>" : "") + "</span>";
      }).join("") : '<div class="hint">Nenhuma opção cadastrada.</div>';

      var body = $("#listas-body", main);
      body.innerHTML =
        '<div class="section-tabs" style="margin-bottom:14px;">' + subtabs + "</div>" +
        '<div class="list-chips">' + chips + "</div>" +
        '<form id="lista-add-form" class="list-add-form"><input type="text" name="novaOpcao" placeholder="Nova opção…" maxlength="60" required><button type="submit" class="btn primary sm">' + ICONS.plus + "Adicionar</button></form>";

      $all("[data-listakey]", body).forEach(function (btn) {
        btn.addEventListener("click", function () { ui.key = btn.getAttribute("data-listakey"); draw(); });
      });
      $all("[data-remove-opt]", body).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var val = btn.getAttribute("data-remove-opt");
          var meta2 = listaMeta(ui.key);
          apiFetch("/api/listas/" + meta2.key + "?valor=" + encodeURIComponent(val), { method: "DELETE" })
            .then(function () {
              STATE.listas[meta2.key] = STATE.listas[meta2.key].filter(function (x) { return x !== val; });
              toast("Opção removida.", "success");
              draw();
            })
            .catch(handleApiError);
        });
      });
      $("#lista-add-form", body).addEventListener("submit", function (ev) {
        ev.preventDefault();
        var fd = new FormData(ev.target);
        var val = (fd.get("novaOpcao") || "").toString().trim().toUpperCase();
        if (!val) return;
        var meta2 = listaMeta(ui.key);
        if (STATE.listas[meta2.key].indexOf(val) !== -1) { toast("Essa opção já existe.", "error"); return; }
        apiFetch("/api/listas/" + meta2.key, { method: "POST", body: { valor: val } })
          .then(function () {
            STATE.listas[meta2.key].push(val);
            toast("Opção adicionada.", "success");
            draw();
          })
          .catch(handleApiError);
      });
    }

    main.innerHTML =
      '<div class="topbar"><div><h1>Administrador</h1><div class="sub">Usuários, permissões e histórico de alterações</div></div></div>' +
      adminTabsHtml("listas") +
      '<div class="panel"><div class="panel-body pad">' +
      '<p class="hint" style="margin-bottom:14px;">Gerencie as opções que aparecem nos campos de seleção do cadastro de pessoas (Cargo, Tipo de pessoa, Status e Projeto). As alterações valem para todos os usuários.</p>' +
      '<div id="listas-body"></div>' +
      "</div></div>";
    bindAdminTabs(main);
    draw();
  }

  /* ---------------- Form field helpers ---------------- */
  function field(label, name, type, obj, opts) {
    opts = opts || {};
    var val = obj ? (obj[name] === undefined || obj[name] === null ? "" : obj[name]) : "";
    return '<div class="field' + (opts.span2 ? " span2" : "") + '"><label>' + esc(label) + '</label><input type="' + type + '" name="' + name + '" value="' + esc(val) + '"' + (opts.required ? " required" : "") + "></div>";
  }
  function selectField(label, name, options, current, opts2) {
    opts2 = opts2 || {};
    var opts = options.slice();
    if (current && opts.indexOf(current) === -1) opts.push(current);
    var emptyOpt = opts2.allowEmpty ? '<option value="">' + esc(opts2.emptyLabel || "— Selecione —") + "</option>" : "";
    return '<div class="field"><label>' + esc(label) + '</label><select name="' + name + '"' + (opts2.required ? " required" : "") + ">" + emptyOpt +
      opts.map(function (o) { return '<option value="' + esc(o) + '"' + (o === current ? " selected" : "") + '>' + esc(o) + "</option>"; }).join("") + "</select></div>";
  }
  function cargoSelectField(p) {
    var current = p ? (p.cargo || "") : "";
    var cargoOpts = listaOptions("cargo");
    var opts = cargoOpts.map(function (c) { return '<option value="' + esc(c) + '"' + (c === current ? " selected" : "") + '>' + esc(c) + "</option>"; }).join("");
    var legado = (current && cargoOpts.indexOf(current) === -1) ? '<option value="' + esc(current) + '" selected>' + esc(current) + " (cadastro antigo)</option>" : "";
    return '<div class="field"><label>Cargo *</label><select name="cargo" required><option value="">— Selecione —</option>' + opts + legado + "</select></div>";
  }
  function setupTabs() {
    $all(".section-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        $all(".section-tab").forEach(function (t) { t.classList.remove("active"); });
        $all(".tab-pane").forEach(function (p) { p.classList.remove("active"); });
        tab.classList.add("active");
        $('.tab-pane[data-pane="' + tab.getAttribute("data-tab") + '"]').classList.add("active");
      });
    });
  }
  function activateFormTab(tabKey) {
    var btn = $('.section-tab[data-tab="' + tabKey + '"]');
    if (btn) btn.click();
  }

  /* ---------------- Drawer / Modal ---------------- */
  function openDrawer(html, opts) {
    var overlay = $("#drawer-overlay");
    var content = $("#drawer-content");
    content.innerHTML = html;
    content.classList.toggle("wide", !!(opts && opts.wide));
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    var overlay = $("#drawer-overlay");
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }
  function openModal(html) {
    var overlay = $("#modal-overlay");
    $("#modal-content").innerHTML = html;
    overlay.classList.add("open");
  }
  function closeModal() {
    $("#modal-overlay").classList.remove("open");
  }

  /* ---------------- Exportar para Excel ----------------
     Site normal, sem sandbox de Artifact: "Baixar Excel" sempre gera o Blob
     e dispara o download direto via <a download>. copyRowsToClipboard fica
     só como reforço defensivo caso o download em si falhe (ex.: navegador
     bloqueando o Blob por algum motivo). */
  function xlsCell(v) {
    v = (v === null || v === undefined) ? "" : String(v);
    return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function slugFilename(s) {
    return (s || "planilha")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "planilha";
  }
  function buildXlsHtml(headers, rows) {
    var thead = "<tr>" + headers.map(function (h) { return "<th>" + xlsCell(h) + "</th>"; }).join("");
    thead = thead + "</tr>";
    var tbody = rows.map(function (r) {
      return "<tr>" + r.map(function (c) { return "<td>" + xlsCell(c) + "</td>"; }).join("") + "</tr>";
    }).join("");
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
      "<head><meta charset=\"UTF-8\"></head><body><table border=\"1\">" + thead + tbody + "</table></body></html>";
  }
  function blobDownload(filename, mime, content) {
    try {
      var blob = new Blob([content], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) { return false; }
  }
  function downloadRowsAsXls(filenameBase, headers, rows) {
    if (!rows.length) { toast("Nada para exportar.", "error"); return; }
    var base = slugFilename(filenameBase);
    if (blobDownload(base + ".xls", "application/vnd.ms-excel", "\uFEFF" + buildXlsHtml(headers, rows))) {
      toast("Excel baixado.", "success");
    } else {
      copyRowsToClipboard(headers, rows);
    }
  }
  function tsvCell(v) {
    v = (v === null || v === undefined) ? "" : String(v);
    return v.replace(/\t/g, " ").replace(/\r?\n/g, " ");
  }
  function buildTsv(headers, rows) {
    var lines = [headers.map(tsvCell).join("\t")].concat(
      rows.map(function (r) { return r.map(tsvCell).join("\t"); })
    );
    return lines.join("\n");
  }
  function legacyCopy(text, cb) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      cb(ok);
    } catch (e) { cb(false); }
  }
  function openCopyFallbackModal(text) {
    var html =
      '<div class="modal-box" style="width:min(640px, 92vw);"><h3>Exportar para Excel</h3>' +
      '<p>Não foi possível copiar automaticamente. Selecione todo o texto abaixo (Ctrl+A, Ctrl+C) e cole em uma planilha do Excel.</p>' +
      '<textarea id="export-fallback-text" readonly style="width:100%;height:220px;font-family:monospace;font-size:12px;">' + esc(text) + "</textarea>" +
      '<div class="modal-actions"><button type="button" class="btn primary" id="modal-cancel">Fechar</button></div>' +
      "</div>";
    openModal(html);
    $("#modal-cancel").addEventListener("click", closeModal);
    var ta = $("#export-fallback-text");
    if (ta) { ta.focus(); ta.select(); }
  }
  function copyRowsToClipboard(headers, rows) {
    if (!rows.length) { toast("Nada para exportar.", "error"); return; }
    var text = buildTsv(headers, rows);
    function done(ok) {
      if (ok) toast("Tabela copiada! Cole em uma planilha do Excel (Ctrl+V).", "success");
      else openCopyFallbackModal(text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { legacyCopy(text, done); });
    } else {
      legacyCopy(text, done);
    }
  }

  document.addEventListener("click", function (e) {
    if (e.target.id === "drawer-overlay") closeDrawer();
    if (e.target.id === "modal-overlay") closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeDrawer(); closeModal(); }
  });

  /* ---------------- Main render / router ---------------- */
  function renderShellCounts() {
    $all("[data-nav]").forEach(function (btn) {
      var key = btn.getAttribute("data-nav");
      var countEl = btn.querySelector(".nav-count");
      if (!countEl) return;
      if (key === "equipes") countEl.textContent = countTeamLideres(true);
      else if (STATE[key]) countEl.textContent = STATE[key].length;
    });
  }

  function render() {
    if (!STATE) return;
    if (!CURRENT_USER) { renderLoginScreen(); return; }
    if (CURRENT_USER.mustChangePassword) { renderTrocarSenhaScreen(); return; }
    hideAuthOverlay();
    renderShell();
    var route = currentRoute();
    var main = $("#app-main");
    var hashEmpty = !location.hash || location.hash === "#" || location.hash === "#/";

    if (route.view === "admin") {
      if (!isAdmin()) { renderSemPermissao(main); if (!route.id) closeDrawer(); return; }
      route.id === "log" ? renderAdminLog(main) : route.id === "listas" ? renderAdminListas(main) : route.id === "sync" ? renderAdminSync(main) : renderAdminUsuarios(main);
      if (!route.id) closeDrawer();
      return;
    }

    var routePageMap = { treinamentos: "painel", pessoas: "pessoas", equipes: "equipes", empresas: "empresas" };
    var pageKey = routePageMap[route.view] || "painel";
    if (!canView(pageKey)) {
      if (hashEmpty) {
        var alt = firstAllowedRoute();
        if (alt) { navigate("#/" + alt); return; }
      }
      renderSemPermissao(main);
      if (!route.id) closeDrawer();
      return;
    }

    if (route.view === "pessoas") route.id ? renderPessoaDetail(main, route.id) : renderPessoasList(main);
    else if (route.view === "equipes") route.id ? renderEquipeDetail(main, route.id) : renderEquipesList(main);
    else if (route.view === "empresas") route.id ? renderEmpresaDetail(main, route.id) : renderEmpresasList(main);
    else if (route.view === "treinamentos") route.id ? renderTreinamentoDetail(main, route.id) : renderTreinamentosList(main);
    else route.id ? renderTreinamentoDetail(main, route.id) : renderTreinamentosList(main);
    if (!route.id) closeDrawer();
  }

  /* ---------------- Init ----------------
     Sessão vive num cookie httpOnly do Supabase Auth — o cliente descobre
     quem está logado chamando GET /api/auth/me (nunca retorna erro, só
     {usuario:null} quando deslogado). Só busca /api/state (que exige sessão
     válida) depois de confirmar que há um usuário logado. */
  function init() {
    apiFetch("/api/auth/me", { silentAuth: true })
      .then(function (data) {
        CURRENT_USER = mapUsuarioFromApi(data && data.usuario);
        if (!CURRENT_USER) {
          STATE = { pessoas: [], empresas: [], treinamentos: [], equipes: [], listas: {} };
          render();
          return;
        }
        return loadState().then(function (data2) {
          STATE = data2;
          ensureListasSeed();
          render();
        });
      })
      .catch(function () {
        CURRENT_USER = null;
        STATE = { pessoas: [], empresas: [], treinamentos: [], equipes: [], listas: {} };
        render();
      });
  }

  // O <script> é carregado com strategy="afterInteractive" (ver
  // src/app/page.tsx) — o DOMContentLoaded pode já ter disparado antes deste
  // arquivo rodar, e nesse caso um addEventListener("DOMContentLoaded", ...)
  // nunca chamaria init() (página fica em branco, sem erro nenhum no console).
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
