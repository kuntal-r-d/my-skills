export function educationLevels(label: string, explanation: string, value?: unknown) {
  const valStr = value != null ? String(value) : '';
  return {
    beginner: `${label}: ${explanation.split('.')[0]}.`,
    intermediate: explanation,
    advanced: valStr ? `${explanation} Current value: ${valStr}.` : explanation,
  };
}
