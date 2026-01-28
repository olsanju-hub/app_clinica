// js/app.js
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    step: 1,

    // Step 1
    hr: null,
    sbp: null,

    // Estos pueden venir de radios (Sí/No) o de checkbox (fallback)
    ecgConfirmed: null,  // null | true | false
    ischemicPain: null,
    pulmEdema: null,
    ams: null,

    // Step 2
    scenario: null, // unstable | stable

    // Step 4
    postState: null,

    // Step 5
    strategy: null, // rate | rhythm
    afDuration: "unknown",
    needsCardioversionNow: false,

    // Scores
    cha: { hf:false, htn:false, dm:false, vasc:false, stroke:false, age:"lt65" },
    has: { htn:false, renal:false, liver:false, stroke:false, bleed:false, inr:false, age:false, drugs:false, alcohol:false },

    // Anticoag
    pt: { age:null, weight:null, scr:null, sex:"male", dd_dual:false, dd_pgp:false }
  };

  const steps = [
    { id: 1, name: "Datos iniciales" },
    { id: 2, name: "Escenario clínico" },
    { id: 3, name: "FA inestable" },
    { id: 4, name: "Reevaluación" },
    { id: 5, name: "FA estable: control" },
    { id: 6, name: "Riesgo y anticoagulación" },
    { id: 7, name: "Plan final" },
  ];

  /* =======================
     Utilidades
  ======================= */

  function safeNum(v) {
    const n = Number(String(v ?? "").trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function setAlert(msg) {
    const box = $("#alerts");
    if (!box) return;
    box.innerHTML = `<div class="alert">${msg}</div>`;
  }

  function clearAlerts() {
    const box = $("#alerts");
    if (box) box.innerHTML = "";
  }

  // 1) Intenta leer radios Sí/No por name (value yes/no)
  function readYNRadio(name) {
    const r = $(`input[name="${name}"]:checked`);
    if (!r) return null;
    return r.value === "yes";
  }

  // 2) Fallback: checkbox por id (true/false, nunca null)
  function readCheckbox(id) {
    const el = $(`#${id}`);
    if (!el) return null;           // si no existe
    if (el.type !== "checkbox") return null;
    return Boolean(el.checked);     // true/false
  }

  // Lectura robusta: primero radios; si no existen, checkbox
  function readYN(name, checkboxIdFallback) {
    const r = readYNRadio(name);
    if (r !== null) return r;

    // Si NO hay radios, intentamos checkbox
    const cb = readCheckbox(checkboxIdFallback);
    if (cb !== null) return cb;

    return null;
  }

  /* =======================
     Navegación
  ======================= */

  function showStep(id) {
    state.step = id;

    $$(".step").forEach(s => {
      s.style.display = Number(s.dataset.step) === id ? "block" : "none";
    });

    const meta = steps.find(s => s.id === id);
    const stepName = $("#stepName");
    if (stepName) stepName.textContent = meta ? meta.name : "";

    const btnBack = $("#btnBack");
    const btnNext = $("#btnNext");
    if (btnBack) btnBack.disabled = id === 1;
    if (btnNext) btnNext.textContent = id === steps.length ? "Finalizar" : "Siguiente";

    clearAlerts();

    if (id === 2) autoSuggestScenario();
    if (id === 5) renderCVBlockVisibility();
    if (id === 6) updateScores();
    if (id === 7) renderFinalSummary();

    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function goNext() {
    if (!validateStep(state.step)) return;

    // salto condicional tras escenario
    if (state.step === 2) {
      showStep(state.scenario === "unstable" ? 3 : 4);
      return;
    }
    if (state.step === 3) {
      showStep(4);
      return;
    }

    if (state.step < steps.length) showStep(state.step + 1);
  }

  function goBack() {
    if (state.step === 4 && state.scenario === "unstable") return showStep(3);
    if (state.step === 4 && state.scenario === "stable") return showStep(2);
    if (state.step > 1) showStep(state.step - 1);
  }

  /* =======================
     Validación por pasos
  ======================= */

  function validateStep(id) {
    if (id === 1) {
      state.hr = safeNum($("#hr")?.value);
      state.sbp = safeNum($("#sbp")?.value);

      // IMPORTANTE: aquí están los fallback ids que tu HTML YA tiene
      state.ecgConfirmed  = readYN("ecgYN", "ecgConfirmed");
      state.ischemicPain  = readYN("ischemicPainYN", "ischemicPain");
      state.pulmEdema     = readYN("pulmEdemaYN", "pulmEdema");
      state.ams           = readYN("amsYN", "ams");

      // Obligatorio FC y PAS
      if (state.hr == null) return setAlert("Introduce la frecuencia cardiaca."), false;
      if (state.sbp == null) return setAlert("Introduce la presión arterial sistólica."), false;

      // Si hay radios, exigimos que esté respondido (null bloquea).
      // Si hay checkbox, nunca será null, así que no bloquea por “no respondido”.
      if (state.ecgConfirmed == null) return setAlert("Indica Sí/No: FA confirmada en ECG."), false;
      if (state.ecgConfirmed === false) return setAlert("Confirma FA en ECG para continuar."), false;

      if (state.ischemicPain == null) return setAlert("Indica Sí/No: dolor torácico isquémico persistente."), false;
      if (state.pulmEdema == null) return setAlert("Indica Sí/No: edema agudo de pulmón / disnea grave."), false;
      if (state.ams == null) return setAlert("Indica Sí/No: alteración del nivel de conciencia."), false;
    }

    if (id === 2) {
      const r = $('input[name="scenario"]:checked');
      state.scenario = r ? r.value : null;
      if (!state.scenario) return setAlert("Confirma el escenario clínico."), false;
    }

    if (id === 4) {
      const r = $('input[name="postState"]:checked');
      state.postState = r ? r.value : null;
      if (!state.postState) return setAlert("Selecciona el estado tras la reevaluación."), false;
    }

    if (id === 5) {
      const r = $('input[name="strategy"]:checked');
      state.strategy = r ? r.value : null;
      if (!state.strategy) return setAlert("Selecciona una estrategia inicial."), false;

      state.afDuration = $("#afDuration")?.value ?? "unknown";
      state.needsCardioversionNow = Boolean($("#needsCardioversionNow")?.checked);
    }

    if (id === 6) updateScores();

    clearAlerts();
    return true;
  }

  function autoSuggestScenario() {
    const suggestUnstable = Boolean(state.ischemicPain || state.pulmEdema || state.ams);

    if (!state.scenario) {
      state.scenario = suggestUnstable ? "unstable" : "stable";
      const r = $$('input[name="scenario"]').find(x => x.value === state.scenario);
      if (r) r.checked = true;
    }
  }

  /* =======================
     Cardioversión visibilidad
  ======================= */

  function renderCVBlockVisibility() {
    const show = $('input[name="strategy"]:checked')?.value === "rhythm";
    const cvBlock = $("#cvBlock");
    const cvDetails = $("#cvDetails");
    if (cvBlock) cvBlock.hidden = !show;

    const checked = Boolean($("#needsCardioversionNow")?.checked);
    if (cvDetails) cvDetails.hidden = !(show && checked);
  }

  /* =======================
     Scores
  ======================= */

  function calcCHA() {
    let s = 0;
    if (state.cha.hf) s++;
    if (state.cha.htn) s++;
    if (state.cha.dm) s++;
    if (state.cha.vasc) s++;
    if (state.cha.stroke) s += 2;
    if (state.cha.age === "65-74") s++;
    if (state.cha.age === "ge75") s += 2;
    return s;
  }

  function calcHAS() {
    let s = 0;
    Object.values(state.has).forEach(v => v && s++);
    return s;
  }

  function updateScores() {
    state.cha.hf = Boolean($("#cha_hf")?.checked);
    state.cha.htn = Boolean($("#cha_htn")?.checked);
    state.cha.dm = Boolean($("#cha_dm")?.checked);
    state.cha.vasc = Boolean($("#cha_vasc")?.checked);
    state.cha.stroke = Boolean($("#cha_stroke")?.checked);
    state.cha.age = $("#cha_age")?.value ?? state.cha.age;

    state.has.htn = Boolean($("#has_htn")?.checked);
    state.has.renal = Boolean($("#has_renal")?.checked);
    state.has.liver = Boolean($("#has_liver")?.checked);
    state.has.stroke = Boolean($("#has_stroke")?.checked);
    state.has.bleed = Boolean($("#has_bleed")?.checked);
    state.has.inr = Boolean($("#has_inr")?.checked);
    state.has.age = Boolean($("#has_age")?.checked);
    state.has.drugs = Boolean($("#has_drugs")?.checked);
    state.has.alcohol = Boolean($("#has_alcohol")?.checked);

    const cha = calcCHA();
    const has = calcHAS();

    $("#scoreCHA").textContent = String(cha);
    $("#scoreHAS").textContent = String(has);

    const chaInterp = $("#chaInterpretation");
    if (chaInterp) {
      chaInterp.textContent =
        cha === 0 ? "Riesgo tromboembólico bajo."
        : cha === 1 ? "Riesgo tromboembólico bajo-intermedio."
        : "Riesgo tromboembólico elevado.";
    }

    const hasInterp = $("#hasInterpretation");
    if (hasInterp) {
      hasInterp.textContent =
        has <= 1 ? "Riesgo hemorrágico bajo."
        : has === 2 ? "Riesgo hemorrágico moderado."
        : "Riesgo hemorrágico alto (priorizar factores modificables y seguimiento).";
    }

    const anticoagBlock = $("#anticoagBlock");
    const showAnticoag = (cha >= 1);
    if (anticoagBlock) anticoagBlock.hidden = !showAnticoag;

    if (showAnticoag) {
      readPtInputs();
      renderCrClAndDoses();
    }
  }

  /* =======================
     Anticoagulación
  ======================= */

  function readPtInputs() {
    state.pt.age = safeNum($("#pt_age")?.value);
    state.pt.weight = safeNum($("#pt_weight")?.value);
    state.pt.scr = safeNum($("#pt_scr")?.value);
    state.pt.sex = $("#pt_sex")?.value ?? state.pt.sex;
    state.pt.dd_dual = Boolean($("#dd_strong_dual")?.checked);
    state.pt.dd_pgp = Boolean($("#dd_pgp")?.checked);
  }

  function calcCrCl(age, weight, scr, sex) {
    if (age == null || weight == null || scr == null) return null;
    if (age <= 0 || weight <= 0 || scr <= 0) return null;
    let crcl = ((140 - age) * weight) / (72 * scr);
    if (sex === "female") crcl *= 0.85;
    return crcl;
  }

  function doacDecision(crcl) {
    const age = state.pt.age;
    const wt = state.pt.weight;
    const scr = state.pt.scr;

    const res = [];

    // Apixabán
    const apxCriteria = [
      age != null && age >= 80,
      wt != null && wt <= 60,
      scr != null && scr >= 1.5
    ].filter(Boolean).length;

    let apxOk = crcl >= 15;
    let apxDose = apxOk ? (apxCriteria >= 2 ? "2,5 mg cada 12 h" : "5 mg cada 12 h") : "No indicado";
    if (apxOk && state.pt.dd_dual) {
      // si hay interacción fuerte y ya estás reducido -> no; si estabas estándar -> reducir
      if (apxDose.startsWith("5")) apxDose = "2,5 mg cada 12 h";
      else { apxOk = false; apxDose = "No indicado"; }
    }
    res.push({ name: "Apixabán", ok: apxOk, dose: apxDose });

    // Rivaroxabán
    let rivOk = crcl >= 15;
    let rivDose = !rivOk ? "No indicado" : (crcl < 50 ? "15 mg cada 24 h" : "20 mg cada 24 h");
    res.push({ name: "Rivaroxabán", ok: rivOk, dose: rivDose });

    // Edoxabán
    let edoOk = crcl >= 15;
    let edoDose = "No indicado";
    if (edoOk) {
      edoDose = (crcl <= 50 || (wt != null && wt <= 60) || state.pt.dd_pgp) ? "30 mg cada 24 h" : "60 mg cada 24 h";
    }
    res.push({ name: "Edoxabán", ok: edoOk, dose: edoDose });

    // Dabigatrán (práctico por CrCl + edad)
    let dabOk = crcl >= 15;
    let dabDose = "No indicado";
    if (dabOk) {
      if (crcl < 30) dabDose = "75 mg cada 12 h";
      else if (crcl < 50 || (age != null && age >= 80)) dabDose = "110 mg cada 12 h";
      else dabDose = "150 mg cada 12 h";
    }
    res.push({ name: "Dabigatrán", ok: dabOk, dose: dabDose });

    return res;
  }

  function renderCrClAndDoses() {
    const crcl = calcCrCl(state.pt.age, state.pt.weight, state.pt.scr, state.pt.sex);

    const crclValue = $("#crclValue");
    if (crclValue) crclValue.textContent = crcl == null ? "—" : String(Math.round(crcl));

    const container = $("#doacCards");
    if (!container) return;
    container.innerHTML = "";

    if (crcl == null) return;

    doacDecision(crcl).forEach(d => {
      if (!d.ok) return; // mostramos solo opciones válidas
      const div = document.createElement("div");
      div.className = "doac-card";
      div.innerHTML = `
        <div class="doac-name"><strong>${d.name}</strong></div>
        <div class="doac-dose">${d.dose}</div>
      `;
      container.appendChild(div);
    });
  }

  /* =======================
     Resumen final
  ======================= */

  function renderFinalSummary() {
    const lines = [];
    lines.push("FA – Resumen estructurado");
    lines.push("");
    lines.push(`FC: ${state.hr ?? "—"} lpm`);
    lines.push(`PAS: ${state.sbp ?? "—"} mmHg`);
    lines.push(`FA confirmada en ECG: ${state.ecgConfirmed === true ? "Sí" : "No"}`);
    lines.push(`Dolor isquémico persistente: ${state.ischemicPain ? "Sí" : "No"}`);
    lines.push(`EAP/disnea grave: ${state.pulmEdema ? "Sí" : "No"}`);
    lines.push(`Alteración de conciencia: ${state.ams ? "Sí" : "No"}`);
    lines.push("");
    lines.push(`Escenario: ${state.scenario === "unstable" ? "FA inestable" : state.scenario === "stable" ? "FA estable" : "—"}`);

    const cha = calcCHA();
    const has = calcHAS();
    lines.push("");
    lines.push(`CHA₂DS₂-VA: ${cha}`);
    lines.push(`HAS-BLED: ${has}`);

    // Dosis si hay datos suficientes
    readPtInputs();
    const crcl = calcCrCl(state.pt.age, state.pt.weight, state.pt.scr, state.pt.sex);
    if (cha >= 1 && crcl != null) {
      lines.push(`CrCl (Cockcroft–Gault): ${Math.round(crcl)} ml/min`);
      const opts = doacDecision(crcl).filter(x => x.ok);
      if (opts.length) {
        lines.push("Opciones de ACOD (dosis):");
        opts.forEach(o => lines.push(`- ${o.name}: ${o.dose}`));
      }
    }

    const ta = $("#finalSummary");
    if (ta) ta.value = lines.join("\n");
  }

  /* =======================
     Eventos
  ======================= */

  function wireLiveRecalc() {
    // Step 5: mostrar/ocultar cardioversión
    $$('input[name="strategy"]').forEach(el => el.addEventListener("change", renderCVBlockVisibility));
    $("#needsCardioversionNow")?.addEventListener("change", renderCVBlockVisibility);

    // Step 6: scores + dosis en tiempo real
    const scoreIds = [
      "cha_hf","cha_htn","cha_dm","cha_vasc","cha_stroke","cha_age",
      "has_htn","has_renal","has_liver","has_stroke","has_bleed","has_inr","has_age","has_drugs","has_alcohol"
    ];
    scoreIds.forEach(id => $(`#${id}`)?.addEventListener("change", updateScores));

    const doseIds = ["pt_age","pt_weight","pt_scr","pt_sex","dd_strong_dual","dd_pgp"];
    doseIds.forEach(id => $(`#${id}`)?.addEventListener("input", () => {
      // solo si el bloque está visible
      if (!$("#anticoagBlock")?.hidden) {
        readPtInputs();
        renderCrClAndDoses();
      }
    }));
    doseIds.forEach(id => $(`#${id}`)?.addEventListener("change", () => {
      if (!$("#anticoagBlock")?.hidden) {
        readPtInputs();
        renderCrClAndDoses();
      }
    }));

    // Copiar / reiniciar (si existen)
    $("#btnCopy")?.addEventListener("click", async () => {
      const txt = $("#finalSummary")?.value ?? "";
      if (!txt) return;
      try { await navigator.clipboard.writeText(txt); } catch (_) {}
    });

    $("#btnReset")?.addEventListener("click", () => {
      window.location.reload();
    });

    // About modal (si existe)
    $("#btnAbout")?.addEventListener("click", () => openAbout(true));
    $("#btnCloseAbout")?.addEventListener("click", () => openAbout(false));
    $("#aboutBackdrop")?.addEventListener("click", () => openAbout(false));

    function openAbout(open) {
      const dlg = $("#aboutModal");
      const bd = $("#aboutBackdrop");
      if (!dlg || !bd) return;
      if (open) {
        bd.hidden = false;
        if (typeof dlg.showModal === "function") dlg.showModal();
        else dlg.hidden = false;
      } else {
        bd.hidden = true;
        if (typeof dlg.close === "function") dlg.close();
        else dlg.hidden = true;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("#btnNext")?.addEventListener("click", goNext);
    $("#btnBack")?.addEventListener("click", goBack);

    wireLiveRecalc();
    showStep(1);
  });

})();