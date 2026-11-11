const inrInt = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0
});

const inrPaise = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  const hasPaise = Math.round(num * 100) % 100 !== 0;
  return '₹' + (hasPaise ? inrPaise.format(num) : inrInt.format(num));
}

export function pad2(n) {
  const num = Math.max(0, Math.floor(Number(n) || 0));
  return num < 10 ? '0' + num : String(num);
}

export function formatDuration(minutes) {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  return `${hrs} h ${pad2(mins)} m`;
}

export function formatTime24(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string' && /^\d{2}:\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatSubtitleDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function formatTitleWord(str) {
  const s = String(str || '');
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
