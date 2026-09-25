export const SHIFTS = ["A", "B", "C"];
export const MOVEMENT_TYPES = ["Entrada", "Saída"];
export const LOCATIONS = [
  "Picking", "Análise/Bloqueio", "Repack", "Saroba", "Descarga", "Retornável",
  "Estacionamento - Rota", "Devolução - Rota", "Carregamento - Puxada",
  "Descartável", "Pulmões/Descarga", "Vasilhame",
];
export const REASONS = [
  "Falha no Manuseio", "Falta", "Falta de fitilho", "Vencido", "Consumo interno",
  "Avaria", "Falha manobrista", "Descarte repack", "Quebra ao descarregar",
  "Sem tampa/Liq. pela metade", "Produto sem gás", "Quebra ao carregar",
  "Embalagem secundária", "Corrosão", "Outros",
];
export const RESPONSIBILITIES = ["Conferente", "SVA", "COA", "GOD"];
export const SUBJECT_TYPES = ["Funcionário", "Armazém", "Fábrica"];
export const STATUSES = ["pending", "validated", "returned"];

export function cleanText(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeCode(value) {
  let code = cleanText(value, 40).replace(/^'+/, "").replace(/\.0+$/, "");
  if (/^\d+$/.test(code)) code = String(Number(code));
  return code;
}

export function normalizeMatch(value) {
  return cleanText(value, 200)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function needsInterview(reason) {
  return normalizeMatch(reason).startsWith("quebra ao ");
}

export function isValidator(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const firstName = normalizeMatch(user.display_name || user.username).split(" ")[0];
  return firstName === "diego" || firstName === "joseph";
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function quantity(value, label, { required = false } = {}) {
  if (value === "" || value == null) {
    if (required) throw new Error(`${label} é obrigatória.`);
    return 0;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000000) throw new Error(`${label} inválida.`);
  if (required && number <= 0) throw new Error(`${label} deve ser maior que zero.`);
  return Math.round(number * 1000) / 1000;
}

export function validateOccurrenceInput(input) {
  const occurrenceDate = cleanText(input?.occurrence_date, 10);
  const occurrenceTime = cleanText(input?.occurrence_time, 5);
  const shift = cleanText(input?.shift, 1).toUpperCase();
  const movementType = cleanText(input?.movement_type, 20);
  const location = cleanText(input?.location, 80);
  const subjectType = cleanText(input?.subject_type, 20) || "Funcionário";
  let employeeName = cleanText(input?.employee_name, 160);
  let employeeFunction = cleanText(input?.employee_function, 120);
  const factoryName = cleanText(input?.factory_name, 160);
  const reason = cleanText(input?.reason, 100);
  const responsibility = cleanText(input?.responsibility, 30);
  const comments = cleanText(input?.comments, 3000);
  const interviewReport = cleanText(input?.interview_report, 4000);

  if (!validIsoDate(occurrenceDate)) throw new Error("Informe uma data válida.");
  if (!validTime(occurrenceTime)) throw new Error("Informe uma hora válida.");
  if (!SHIFTS.includes(shift)) throw new Error("Selecione o turno A, B ou C.");
  if (!MOVEMENT_TYPES.includes(movementType)) throw new Error("Selecione Entrada ou Saída.");
  if (!LOCATIONS.includes(location)) throw new Error("Selecione uma área/local válido.");
  if (!SUBJECT_TYPES.includes(subjectType)) throw new Error("Selecione Funcionário, Armazém ou Fábrica.");
  if (subjectType === "Funcionário") {
    if (!employeeName) throw new Error("Informe o funcionário relacionado.");
    if (!employeeFunction) throw new Error("Informe a função do funcionário.");
  } else if (subjectType === "Armazém") {
    employeeName = "";
    employeeFunction = "";
  } else {
    if (!factoryName) throw new Error("Informe a fábrica relacionada.");
    employeeName = "";
    employeeFunction = "";
  }
  if (!REASONS.includes(reason)) throw new Error("Selecione um motivo válido.");
  if (!RESPONSIBILITIES.includes(responsibility)) throw new Error("Selecione o responsável.");
  if (subjectType === "Funcionário" && needsInterview(reason) && interviewReport.length < 10) {
    throw new Error("Registre a entrevista para ocorrências de quebra.");
  }

  const sourceItems = Array.isArray(input?.items) ? input.items : [];
  if (!sourceItems.length || sourceItems.length > 20) throw new Error("Inclua de 1 a 20 produtos.");
  const items = sourceItems.map((item, index) => {
    const skuCode = normalizeCode(item?.sku_code);
    if (!skuCode) throw new Error(`Informe o código do produto ${index + 1}.`);
    const totalQty = quantity(item?.total_qty, `Quantidade total do produto ${index + 1}`, { required: true });
    const repackedQty = quantity(item?.repacked_qty, `Quantidade reembalada do produto ${index + 1}`);
    const discardedQty = quantity(item?.discarded_qty, `Quantidade descartada do produto ${index + 1}`);
    if (repackedQty + discardedQty > totalQty + 0.0001) {
      throw new Error(`Reembalado + descarte não pode superar o total do produto ${index + 1}.`);
    }
    const expiryDate = cleanText(item?.expiry_date, 10);
    if (expiryDate && !validIsoDate(expiryDate)) throw new Error(`Validade inválida no produto ${index + 1}.`);
    return {
      sku_code: skuCode,
      total_qty: totalQty,
      repacked_qty: repackedQty,
      discarded_qty: discardedQty,
      invoice_number: cleanText(item?.invoice_number, 80) || null,
      lot_number: cleanText(item?.lot_number, 80) || null,
      expiry_date: expiryDate || null,
    };
  });

  return {
    occurrence_date: occurrenceDate,
    occurrence_time: occurrenceTime,
    shift,
    movement_type: movementType,
    location,
    subject_type: subjectType,
    factory_name: subjectType === "Fábrica" ? factoryName : null,
    employee_name: employeeName,
    employee_function: employeeFunction,
    reason,
    responsibility,
    comments: comments || null,
    interview_report: interviewReport || null,
    items,
  };
}

export function weekOfMonth(isoDate) {
  return Math.ceil(Number(String(isoDate).slice(8, 10)) / 7);
}

