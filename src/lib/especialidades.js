// Medical specialties: chosen when the account is created (or later in Configuración → Marca).
// Each one adapts the platform: consultation types offered, clinical fields of each appointment
// (saved in citas.datos), the notes hint, the greeting line and a starter price list (Tarifas).
// Consultation types always come from TIPOS_CITA so reports, filters and Studio keep working.

const n = (k, label, unidad) => ({ k, label, tipo: 'numero', unidad })
const t = (k, label, ayuda) => ({ k, label, tipo: 'texto', ayuda })
const o = (k, label, opciones) => ({ k, label, tipo: 'opciones', opciones })
const PRESION = t('presion', 'Presión arterial', 'Ej. 120/80')

export const ESPECIALIDADES = [
  {
    value: 'general', label: 'Medicina general',
    lema: 'Pacientes, citas, cobros y reportes de su consulta en un solo lugar.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento'],
    campos: [PRESION, n('fc', 'Frecuencia cardíaca', 'lpm'), n('temp', 'Temperatura', '°C'), t('diagnostico', 'Diagnóstico')],
    notas: 'Motivo de consulta, examen físico, diagnóstico e indicaciones…',
    servicios: [['Primera consulta', 'Consulta general'], ['Seguimiento', 'Control'], ['Procedimiento', 'Curación'], ['Procedimiento', 'Inyección']],
  },
  {
    value: 'flebologia', label: 'Flebología y cirugía vascular',
    lema: 'Expedientes, escleroterapias y cirugías de várices, con antes y después de cada paciente.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [o('pierna', 'Pierna tratada', ['Derecha', 'Izquierda', 'Ambas']), o('ceap', 'Clasificación CEAP', ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6']), o('doppler', 'Ultrasonido Doppler', ['No realizado', 'Normal', 'Insuficiencia safena', 'Otro hallazgo']), n('sesion', 'Sesión número')],
    notas: 'Síntomas, hallazgos del Doppler, zonas tratadas, indicaciones de medias de compresión…',
    servicios: [['Primera consulta', 'Consulta y valoración vascular'], ['Evaluación', 'Ultrasonido Doppler venoso'], ['Procedimiento', 'Escleroterapia'], ['Procedimiento', 'Escleroterapia con espuma'], ['Cirugía', 'Ablación láser endovenosa'], ['Cirugía', 'Cirugía de várices']],
  },
  {
    value: 'cirugia_plastica', label: 'Cirugía plástica y estética',
    lema: 'Valoraciones, cirugías y su seguimiento con fotos de antes y después.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [t('zona', 'Zona a tratar'), o('etapa', 'Etapa', ['Valoración', 'Preoperatorio', 'Postoperatorio', 'Alta']), n('dias_post', 'Días postoperatorio')],
    notas: 'Expectativas del paciente, plan quirúrgico, evolución, cuidados postoperatorios…',
    servicios: [['Primera consulta', 'Valoración estética'], ['Procedimiento', 'Toxina botulínica'], ['Procedimiento', 'Ácido hialurónico'], ['Cirugía', 'Rinoplastía'], ['Cirugía', 'Liposucción'], ['Cirugía', 'Aumento mamario'], ['Cirugía', 'Abdominoplastía']],
  },
  {
    value: 'neurologia', label: 'Neurología',
    lema: 'Historia clínica neurológica, estudios y seguimiento de cada paciente.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento'],
    campos: [PRESION, n('dolor', 'Escala de dolor (0 a 10)'), o('estudio', 'Estudio', ['Ninguno', 'Electroencefalograma', 'Electromiografía', 'Resonancia', 'Tomografía']), t('diagnostico', 'Diagnóstico')],
    notas: 'Síntomas, examen neurológico, estudios solicitados, tratamiento…',
    servicios: [['Primera consulta', 'Consulta neurológica'], ['Seguimiento', 'Control neurológico'], ['Evaluación', 'Electroencefalograma'], ['Evaluación', 'Electromiografía'], ['Procedimiento', 'Bloqueo nervioso']],
  },
  {
    value: 'gastroenterologia', label: 'Gastroenterología',
    lema: 'Consultas, endoscopías y seguimiento digestivo de cada paciente.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [o('estudio', 'Estudio', ['Ninguno', 'Endoscopía', 'Colonoscopía', 'Ultrasonido abdominal', 'Laboratorios']), t('hallazgos', 'Hallazgos'), t('diagnostico', 'Diagnóstico')],
    notas: 'Síntomas digestivos, dieta, hallazgos, tratamiento…',
    servicios: [['Primera consulta', 'Consulta gastroenterológica'], ['Seguimiento', 'Control'], ['Evaluación', 'Ultrasonido abdominal'], ['Procedimiento', 'Endoscopía'], ['Procedimiento', 'Colonoscopía']],
  },
  {
    value: 'cardiologia', label: 'Cardiología',
    lema: 'Presión, estudios del corazón y control de cada paciente, en un solo lugar.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [PRESION, n('fc', 'Frecuencia cardíaca', 'lpm'), n('spo2', 'Saturación de oxígeno', '%'), o('estudio', 'Estudio', ['Ninguno', 'Electrocardiograma', 'Ecocardiograma', 'Holter', 'Prueba de esfuerzo'])],
    notas: 'Síntomas, factores de riesgo, resultado de estudios, tratamiento…',
    servicios: [['Primera consulta', 'Consulta cardiológica'], ['Seguimiento', 'Control cardiológico'], ['Evaluación', 'Electrocardiograma'], ['Evaluación', 'Ecocardiograma'], ['Evaluación', 'Holter de 24 horas'], ['Evaluación', 'Prueba de esfuerzo']],
  },
  {
    value: 'ginecologia', label: 'Ginecología y obstetricia',
    lema: 'Controles prenatales, consultas y procedimientos de cada paciente.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [t('fum', 'Fecha de última regla', 'Ej. 12/09/2026'), t('gpa', 'Gestas / Partos / Abortos', 'Ej. G2 P1 A0'), n('semanas', 'Semanas de embarazo'), PRESION],
    notas: 'Motivo de consulta, examen ginecológico, ultrasonido, indicaciones…',
    servicios: [['Primera consulta', 'Consulta ginecológica'], ['Seguimiento', 'Control prenatal'], ['Evaluación', 'Ultrasonido obstétrico'], ['Evaluación', 'Papanicolaou'], ['Procedimiento', 'Colposcopía'], ['Cirugía', 'Cesárea']],
  },
  {
    value: 'pediatria', label: 'Pediatría',
    lema: 'El crecimiento, las vacunas y las consultas de cada niño, en orden.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento'],
    campos: [t('tutor', 'Padre, madre o encargado'), n('perimetro', 'Perímetro cefálico', 'cm'), n('temp', 'Temperatura', '°C'), t('vacunas', 'Vacunas aplicadas')],
    notas: 'Motivo de consulta, desarrollo, alimentación, indicaciones a los padres…',
    servicios: [['Primera consulta', 'Consulta pediátrica'], ['Seguimiento', 'Control de niño sano'], ['Procedimiento', 'Aplicación de vacuna'], ['Procedimiento', 'Nebulización']],
  },
  {
    value: 'dermatologia', label: 'Dermatología',
    lema: 'Consultas, tratamientos de piel y fotos de evolución de cada paciente.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [t('zona', 'Zona afectada'), o('fototipo', 'Fototipo', ['I', 'II', 'III', 'IV', 'V', 'VI']), t('diagnostico', 'Diagnóstico')],
    notas: 'Lesiones, evolución, tratamiento tópico u oral, cuidados…',
    servicios: [['Primera consulta', 'Consulta dermatológica'], ['Procedimiento', 'Crioterapia'], ['Procedimiento', 'Peeling químico'], ['Procedimiento', 'Biopsia de piel'], ['Cirugía', 'Extirpación de lunar']],
  },
  {
    value: 'traumatologia', label: 'Traumatología y ortopedia',
    lema: 'Lesiones, cirugías y rehabilitación de cada paciente, paso a paso.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [t('zona', 'Zona / articulación'), o('lado', 'Lado', ['Derecho', 'Izquierdo', 'Ambos']), n('dolor', 'Escala de dolor (0 a 10)'), o('estudio', 'Estudio', ['Ninguno', 'Rayos X', 'Resonancia', 'Tomografía'])],
    notas: 'Mecanismo de la lesión, examen físico, plan de tratamiento, rehabilitación…',
    servicios: [['Primera consulta', 'Consulta de traumatología'], ['Procedimiento', 'Infiltración'], ['Procedimiento', 'Colocación de yeso'], ['Cirugía', 'Artroscopía']],
  },
  {
    value: 'odontologia', label: 'Odontología',
    lema: 'Tratamientos, piezas dentales y pagos de cada paciente, sin papeles.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [t('piezas', 'Piezas tratadas', 'Ej. 16, 26'), t('tratamiento', 'Tratamiento')],
    notas: 'Hallazgos, odontograma, plan de tratamiento, indicaciones…',
    servicios: [['Primera consulta', 'Evaluación dental'], ['Procedimiento', 'Limpieza dental'], ['Procedimiento', 'Resina'], ['Procedimiento', 'Endodoncia'], ['Procedimiento', 'Blanqueamiento'], ['Cirugía', 'Extracción de cordal']],
  },
  {
    value: 'nutricion', label: 'Nutrición',
    lema: 'Peso, medidas y planes de alimentación de cada paciente, con su evolución.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación'],
    campos: [n('cintura', 'Cintura', 'cm'), n('grasa', 'Grasa corporal', '%'), n('musculo', 'Masa muscular', 'kg'), t('plan', 'Plan de alimentación')],
    notas: 'Hábitos, recordatorio de 24 horas, objetivos, indicaciones…',
    servicios: [['Primera consulta', 'Consulta nutricional'], ['Seguimiento', 'Control de peso'], ['Evaluación', 'Análisis de composición corporal']],
  },
  {
    value: 'oftalmologia', label: 'Oftalmología',
    lema: 'Agudeza visual, estudios y cirugías de cada paciente, en un solo lugar.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [t('av_od', 'Agudeza visual ojo derecho', 'Ej. 20/20'), t('av_oi', 'Agudeza visual ojo izquierdo', 'Ej. 20/25'), t('pio', 'Presión intraocular', 'Ej. 14/15 mmHg')],
    notas: 'Síntomas, examen oftalmológico, refracción, tratamiento…',
    servicios: [['Primera consulta', 'Consulta oftalmológica'], ['Evaluación', 'Examen de la vista'], ['Evaluación', 'Fondo de ojo'], ['Cirugía', 'Cirugía de catarata'], ['Cirugía', 'Cirugía láser refractiva']],
  },
  {
    value: 'psicologia', label: 'Psicología y psiquiatría',
    lema: 'Sesiones, avances y notas de cada paciente, con total orden.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación'],
    campos: [n('sesion', 'Sesión número'), o('modalidad', 'Modalidad', ['Presencial', 'En línea']), t('objetivo', 'Objetivo de la sesión')],
    notas: 'Temas tratados, avances, tareas para la próxima sesión…',
    servicios: [['Primera consulta', 'Primera sesión'], ['Seguimiento', 'Sesión de terapia'], ['Evaluación', 'Evaluación psicológica']],
  },
  {
    value: 'urologia', label: 'Urología',
    lema: 'Consultas, estudios y cirugías urológicas de cada paciente.',
    tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [o('estudio', 'Estudio', ['Ninguno', 'Ultrasonido', 'Uroflujometría', 'Antígeno prostático', 'Laboratorios']), t('diagnostico', 'Diagnóstico')],
    notas: 'Síntomas, examen físico, estudios, tratamiento…',
    servicios: [['Primera consulta', 'Consulta urológica'], ['Evaluación', 'Ultrasonido renal y vesical'], ['Procedimiento', 'Cistoscopía'], ['Cirugía', 'Vasectomía']],
  },
]

const OTRA = ESPECIALIDADES[0]
export const especialidad = (v) => ESPECIALIDADES.find(e => e.value === v) || OTRA

// Consultation types offered when registering/editing (the current one is kept even if the specialty does not list it)
export const tiposDe = (v, actual) => {
  const t = especialidad(v).tipos
  return actual && !t.includes(actual) ? [...t, actual] : t
}

// "Escala de dolor (0 a 10): 6 · Pierna tratada: Ambas" for files and reports
export function resumenDatos(datos, v) {
  if (!datos || typeof datos !== 'object') return ''
  const campos = especialidad(v).campos
  const etiqueta = (k) => campos.find(c => c.k === k)
  return Object.entries(datos)
    .filter(([, val]) => val !== '' && val != null)
    .map(([k, val]) => { const c = etiqueta(k); return c ? `${c.label}: ${val}${c.unidad ? ` ${c.unidad}` : ''}` : `${k}: ${val}` })
    .join(' · ')
}
