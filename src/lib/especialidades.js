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

// ─── Hospital catalogue ───
// Specialties only a hospital offers (pre-loaded in Configuración → Mi hospital). Same shape as the clinic ones above; kept out of ESPECIALIDADES
// on purpose: that list is the clinic specialties shown in every sign-up picker. Services carry no price here (they load as Q0, see sugeridos.js).
const FC = n('fc', 'Frecuencia cardíaca', 'lpm')
const TEMP = n('temp', 'Temperatura', '°C')
const SPO2 = n('spo2', 'Saturación de oxígeno', '%')
const DOLOR = n('dolor', 'Escala de dolor (0 a 10)')
const DIAG = t('diagnostico', 'Diagnóstico')
const ASA = o('asa', 'Clasificación ASA', ['I', 'II', 'III', 'IV', 'V'])
const ETAPA_QX = o('etapa', 'Etapa', ['Valoración', 'Preoperatorio', 'Postoperatorio', 'Alta'])
const LADO = o('lado', 'Lado', ['Derecho', 'Izquierdo', 'Ambos'])
const GLASGOW = n('glasgow', 'Escala de Glasgow (3 a 15)')
const T_CONSULTA = ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento']
const T_QX = ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía']
const H = (e) => ({ ...e, soloHospital: true })

const ESPECIALIDADES_HOSPITAL = [
  H({ value: 'medicina_interna', label: 'Medicina interna', lema: 'Pacientes adultos con enfermedades complejas, su evolución y sus estudios.', tipos: T_CONSULTA,
    campos: [PRESION, FC, TEMP, SPO2, DIAG, o('estudio_interna', 'Estudio', ['Ninguno', 'Laboratorios', 'Rayos X', 'Electrocardiograma', 'Ultrasonido', 'Tomografía'])],
    notas: 'Motivo de consulta, antecedentes, examen físico, diagnóstico y plan…',
    servicios: [['Primera consulta', 'Consulta de medicina interna'], ['Seguimiento', 'Control de medicina interna'], ['Evaluación', 'Valoración de interconsulta'], ['Evaluación', 'Electrocardiograma'], ['Procedimiento', 'Toma de muestras']] }),
  H({ value: 'cirugia_general', label: 'Cirugía general', lema: 'Valoración, cirugía y seguimiento postoperatorio de cada paciente.', tipos: T_QX,
    campos: [DIAG, ASA, ETAPA_QX, n('dias_post', 'Días postoperatorio'), t('cirugia_planeada', 'Cirugía planeada')],
    notas: 'Motivo de consulta, hallazgos, plan quirúrgico, evolución postoperatoria…',
    servicios: [['Primera consulta', 'Consulta de cirugía general'], ['Seguimiento', 'Control postoperatorio'], ['Procedimiento', 'Curación de herida'], ['Cirugía', 'Apendicectomía'], ['Cirugía', 'Colecistectomía'], ['Cirugía', 'Hernioplastía']] }),
  H({ value: 'anestesiologia', label: 'Anestesiología', lema: 'Valoración preanestésica y registro de la anestesia de cada cirugía.', tipos: ['Evaluación', 'Procedimiento', 'Cirugía'],
    campos: [ASA, o('anestesia', 'Tipo de anestesia', ['General', 'Regional', 'Epidural', 'Sedación', 'Local']), o('via_aerea', 'Vía aérea', ['Sin dificultad', 'Posible dificultad', 'Dificultad conocida']), n('ayuno', 'Horas de ayuno', 'h'), t('alergias_med', 'Alergias a medicamentos'), PRESION],
    notas: 'Antecedentes anestésicos, valoración de vía aérea, técnica, incidentes y recuperación…',
    servicios: [['Evaluación', 'Valoración preanestésica'], ['Cirugía', 'Anestesia general'], ['Cirugía', 'Anestesia regional'], ['Procedimiento', 'Anestesia epidural'], ['Procedimiento', 'Sedación para procedimiento']] }),
  H({ value: 'enfermeria', label: 'Enfermería', lema: 'Signos vitales, cuidados y procedimientos de enfermería de cada paciente.', tipos: ['Seguimiento', 'Evaluación', 'Procedimiento'],
    campos: [PRESION, FC, TEMP, SPO2, DOLOR, n('glucosa', 'Glucosa', 'mg/dl'), t('cuidado', 'Cuidado realizado')],
    notas: 'Signos vitales, cuidados realizados, medicamentos administrados, observaciones…',
    servicios: [['Evaluación', 'Toma de signos vitales'], ['Procedimiento', 'Curación'], ['Procedimiento', 'Inyección'], ['Procedimiento', 'Colocación de venoclisis'], ['Procedimiento', 'Nebulización']] }),
  H({ value: 'emergencias', label: 'Emergencias', lema: 'Triaje, atención inmediata y destino de cada paciente de urgencias.', tipos: ['Primera consulta', 'Seguimiento', 'Procedimiento', 'Cirugía'],
    campos: [o('triaje', 'Triaje', ['Rojo (inmediato)', 'Naranja (muy urgente)', 'Amarillo (urgente)', 'Verde (poco urgente)', 'Azul (no urgente)']), t('motivo_ingreso', 'Motivo de ingreso'), PRESION, FC, SPO2, GLASGOW, o('destino', 'Destino', ['Alta', 'Observación', 'Hospitalización', 'Cirugía', 'UCI', 'Traslado'])],
    notas: 'Motivo de ingreso, hallazgos, medidas tomadas, evolución y destino…',
    servicios: [['Primera consulta', 'Atención de emergencia'], ['Seguimiento', 'Observación en emergencia'], ['Procedimiento', 'Sutura'], ['Procedimiento', 'Reanimación'], ['Procedimiento', 'Colocación de yeso']] }),
  H({ value: 'cuidados_intensivos', label: 'Cuidados intensivos', lema: 'Soporte vital y seguimiento diario de cada paciente crítico.', tipos: ['Seguimiento', 'Evaluación', 'Procedimiento'],
    campos: [n('apache', 'APACHE II'), o('ventilacion', 'Soporte ventilatorio', ['Ninguno', 'Oxígeno', 'Ventilación no invasiva', 'Ventilación mecánica']), PRESION, FC, SPO2, GLASGOW, t('soporte', 'Sedación / vasopresores'), n('dias_uci', 'Día en UCI')],
    notas: 'Estado por sistemas, soporte, balance de líquidos, plan del día…',
    servicios: [['Seguimiento', 'Día de cuidados intensivos'], ['Procedimiento', 'Intubación'], ['Procedimiento', 'Colocación de catéter central'], ['Procedimiento', 'Ventilación mecánica'], ['Evaluación', 'Gasometría arterial']] }),
  H({ value: 'neonatologia', label: 'Neonatología', lema: 'Recién nacidos: peso, crecimiento y cuidados de cada bebé.', tipos: T_CONSULTA,
    campos: [n('peso_nacer', 'Peso al nacer', 'g'), n('semanas_gest', 'Edad gestacional', 'semanas'), n('apgar', 'Apgar a los 5 minutos'), TEMP, o('alimentacion', 'Alimentación', ['Lactancia materna', 'Fórmula', 'Mixta', 'Sonda']), n('bilirrubina', 'Bilirrubina', 'mg/dl'), t('tutor', 'Padre, madre o encargado')],
    notas: 'Antecedentes del parto, examen del recién nacido, alimentación, indicaciones a los padres…',
    servicios: [['Primera consulta', 'Valoración del recién nacido'], ['Seguimiento', 'Control neonatal'], ['Procedimiento', 'Fototerapia'], ['Procedimiento', 'Tamizaje neonatal'], ['Evaluación', 'Examen auditivo']] }),
  H({ value: 'neumologia', label: 'Neumología', lema: 'Consultas, estudios respiratorios y seguimiento de cada paciente.', tipos: T_CONSULTA,
    campos: [SPO2, n('fr', 'Frecuencia respiratoria', 'rpm'), o('estudio_neumologia', 'Estudio', ['Ninguno', 'Espirometría', 'Rayos X de tórax', 'Tomografía de tórax', 'Gasometría', 'Broncoscopía']), o('tabaquismo', 'Tabaquismo', ['No fuma', 'Exfumador', 'Fuma']), DIAG],
    notas: 'Síntomas respiratorios, examen pulmonar, estudios, tratamiento…',
    servicios: [['Primera consulta', 'Consulta de neumología'], ['Seguimiento', 'Control respiratorio'], ['Evaluación', 'Espirometría'], ['Procedimiento', 'Broncoscopía'], ['Procedimiento', 'Terapia respiratoria']] }),
  H({ value: 'nefrologia', label: 'Nefrología', lema: 'Función renal, diálisis y control de cada paciente.', tipos: T_CONSULTA,
    campos: [PRESION, n('creatinina', 'Creatinina', 'mg/dl'), n('tfg', 'Filtrado glomerular', 'ml/min'), n('diuresis', 'Diuresis', 'ml/24 h'), o('dialisis', 'Diálisis', ['No requiere', 'Hemodiálisis', 'Diálisis peritoneal']), DIAG],
    notas: 'Síntomas, balance de líquidos, resultados de laboratorio, tratamiento…',
    servicios: [['Primera consulta', 'Consulta de nefrología'], ['Seguimiento', 'Control renal'], ['Procedimiento', 'Hemodiálisis'], ['Procedimiento', 'Colocación de catéter para diálisis'], ['Evaluación', 'Perfil renal']] }),
  H({ value: 'endocrinologia', label: 'Endocrinología', lema: 'Diabetes, tiroides y control hormonal de cada paciente.', tipos: T_CONSULTA,
    campos: [n('glucosa', 'Glucosa', 'mg/dl'), n('hemoglobina_glicosilada', 'Hemoglobina glicosilada', '%'), n('tsh', 'TSH', 'mUI/L'), PRESION, DIAG, t('tratamiento', 'Tratamiento')],
    notas: 'Síntomas, control metabólico, resultados, ajuste de tratamiento…',
    servicios: [['Primera consulta', 'Consulta de endocrinología'], ['Seguimiento', 'Control de diabetes'], ['Evaluación', 'Perfil tiroideo'], ['Evaluación', 'Hemoglobina glicosilada'], ['Procedimiento', 'Biopsia de tiroides']] }),
  H({ value: 'infectologia', label: 'Infectología', lema: 'Infecciones, antibióticos y aislamientos de cada paciente.', tipos: T_CONSULTA,
    campos: [TEMP, t('foco', 'Foco infeccioso'), t('germen', 'Germen aislado'), o('aislamiento', 'Aislamiento', ['Ninguno', 'Contacto', 'Gotas', 'Aéreo']), t('antibiotico', 'Antibiótico'), n('dia_tratamiento', 'Día de tratamiento')],
    notas: 'Foco, cultivos, antibiótico y duración, evolución, medidas de aislamiento…',
    servicios: [['Primera consulta', 'Consulta de infectología'], ['Seguimiento', 'Control de tratamiento antibiótico'], ['Evaluación', 'Cultivos'], ['Evaluación', 'Prueba de VIH'], ['Procedimiento', 'Aplicación de antibiótico']] }),
  H({ value: 'hematologia', label: 'Hematología', lema: 'Estudios de sangre, transfusiones y seguimiento de cada paciente.', tipos: T_CONSULTA,
    campos: [n('hemoglobina', 'Hemoglobina', 'g/dl'), n('plaquetas', 'Plaquetas', 'x1000/µl'), n('leucocitos', 'Leucocitos', 'x1000/µl'), o('transfusion', 'Transfusión', ['No requiere', 'Glóbulos rojos', 'Plaquetas', 'Plasma']), DIAG],
    notas: 'Síntomas, biometría hemática, estudios, tratamiento…',
    servicios: [['Primera consulta', 'Consulta de hematología'], ['Seguimiento', 'Control hematológico'], ['Evaluación', 'Biometría hemática'], ['Procedimiento', 'Transfusión'], ['Procedimiento', 'Aspirado de médula ósea']] }),
  H({ value: 'oncologia', label: 'Oncología', lema: 'Diagnóstico, tratamiento y seguimiento oncológico de cada paciente.', tipos: T_CONSULTA,
    campos: [t('diagnostico_onco', 'Diagnóstico oncológico'), t('estadio', 'Estadio'), o('tratamiento_onco', 'Tratamiento', ['Quimioterapia', 'Radioterapia', 'Inmunoterapia', 'Terapia dirigida', 'Cuidados paliativos', 'Vigilancia']), n('ciclo', 'Ciclo número'), o('ecog', 'Estado funcional (ECOG)', ['0', '1', '2', '3', '4'])],
    notas: 'Historia oncológica, estadio, tratamiento, toxicidad, plan…',
    servicios: [['Primera consulta', 'Consulta de oncología'], ['Seguimiento', 'Control oncológico'], ['Procedimiento', 'Sesión de quimioterapia'], ['Procedimiento', 'Biopsia'], ['Evaluación', 'Marcadores tumorales']] }),
  H({ value: 'reumatologia', label: 'Reumatología', lema: 'Articulaciones, dolor y control de enfermedades reumáticas.', tipos: T_CONSULTA,
    campos: [n('articulaciones', 'Articulaciones dolorosas'), DOLOR, n('rigidez', 'Rigidez matutina', 'min'), o('estudio_reumatologia', 'Estudio', ['Ninguno', 'Factor reumatoide', 'Anti-CCP', 'ANA', 'Rayos X', 'Ultrasonido articular']), DIAG],
    notas: 'Síntomas articulares, examen físico, estudios, tratamiento…',
    servicios: [['Primera consulta', 'Consulta de reumatología'], ['Seguimiento', 'Control reumatológico'], ['Evaluación', 'Perfil reumático'], ['Procedimiento', 'Infiltración articular'], ['Procedimiento', 'Artrocentesis']] }),
  H({ value: 'geriatria', label: 'Geriatría', lema: 'Valoración integral y cuidado del adulto mayor.', tipos: T_CONSULTA,
    campos: [o('dependencia', 'Dependencia (Barthel)', ['Independiente', 'Leve', 'Moderada', 'Severa', 'Total']), o('caidas', 'Caídas en el último año', ['Ninguna', '1', '2 o más']), o('cognitivo', 'Estado cognitivo', ['Normal', 'Deterioro leve', 'Demencia']), n('n_medicamentos', 'Medicamentos que toma'), PRESION, t('cuidador', 'Cuidador')],
    notas: 'Valoración funcional, cognitiva y social, medicamentos, plan de cuidados…',
    servicios: [['Primera consulta', 'Valoración geriátrica integral'], ['Seguimiento', 'Control geriátrico'], ['Evaluación', 'Evaluación cognitiva'], ['Evaluación', 'Evaluación de caídas']] }),
  H({ value: 'psiquiatria', label: 'Psiquiatría', lema: 'Consultas psiquiátricas, medicación y seguimiento de cada paciente.', tipos: ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento'],
    campos: [DIAG, o('riesgo', 'Riesgo suicida', ['Sin riesgo', 'Bajo', 'Moderado', 'Alto']), t('medicacion', 'Medicación'), n('puntaje_phq', 'PHQ-9 (0 a 27)'), n('sesion', 'Sesión número')],
    notas: 'Estado mental, evolución, medicación, riesgo, plan de tratamiento…',
    servicios: [['Primera consulta', 'Consulta psiquiátrica'], ['Seguimiento', 'Control psiquiátrico'], ['Evaluación', 'Evaluación psiquiátrica'], ['Procedimiento', 'Terapia electroconvulsiva']] }),
  H({ value: 'otorrinolaringologia', label: 'Otorrinolaringología', lema: 'Oído, nariz y garganta: consultas, estudios y cirugías.', tipos: T_QX,
    campos: [o('oido', 'Oído afectado', ['Derecho', 'Izquierdo', 'Ambos', 'Ninguno']), o('estudio_orl', 'Estudio', ['Ninguno', 'Audiometría', 'Timpanometría', 'Videonasofibroscopía', 'Tomografía de senos']), t('hallazgos', 'Hallazgos'), DIAG, DOLOR],
    notas: 'Síntomas, examen de oído, nariz y garganta, estudios, tratamiento…',
    servicios: [['Primera consulta', 'Consulta de otorrinolaringología'], ['Evaluación', 'Audiometría'], ['Procedimiento', 'Lavado de oídos'], ['Cirugía', 'Amigdalectomía'], ['Cirugía', 'Septoplastía']] }),
  H({ value: 'neurocirugia', label: 'Neurocirugía', lema: 'Cirugía de cerebro y columna, con el seguimiento de cada paciente.', tipos: T_QX,
    campos: [GLASGOW, t('lesion', 'Localización de la lesión'), o('estudio_neurocirugia', 'Estudio', ['Ninguno', 'Tomografía', 'Resonancia', 'Angiografía']), ETAPA_QX, n('dias_post', 'Días postoperatorio'), DIAG],
    notas: 'Examen neurológico, estudios de imagen, plan quirúrgico, evolución…',
    servicios: [['Primera consulta', 'Consulta de neurocirugía'], ['Seguimiento', 'Control postoperatorio'], ['Cirugía', 'Craneotomía'], ['Cirugía', 'Cirugía de columna'], ['Procedimiento', 'Colocación de válvula de derivación']] }),
  H({ value: 'cirugia_pediatrica', label: 'Cirugía pediátrica', lema: 'Cirugías y cuidados de niños, con sus padres siempre informados.', tipos: T_QX,
    campos: [t('tutor', 'Padre, madre o encargado'), n('edad_meses', 'Edad', 'meses'), DIAG, ASA, n('ayuno', 'Horas de ayuno', 'h'), ETAPA_QX],
    notas: 'Motivo de consulta, examen, plan quirúrgico, cuidados postoperatorios, indicaciones a los padres…',
    servicios: [['Primera consulta', 'Consulta de cirugía pediátrica'], ['Seguimiento', 'Control postoperatorio'], ['Cirugía', 'Hernioplastía pediátrica'], ['Cirugía', 'Circuncisión'], ['Cirugía', 'Apendicectomía pediátrica']] }),
  H({ value: 'maxilofacial', label: 'Cirugía maxilofacial', lema: 'Cirugía de cara, mandíbula y boca, con su seguimiento.', tipos: T_QX,
    campos: [t('zona_tratada', 'Zona tratada'), o('estudio_maxilofacial', 'Estudio', ['Ninguno', 'Panorámica', 'Rayos X', 'Tomografía facial']), ETAPA_QX, DOLOR, DIAG],
    notas: 'Motivo de consulta, hallazgos, plan quirúrgico, cuidados postoperatorios…',
    servicios: [['Primera consulta', 'Consulta maxilofacial'], ['Seguimiento', 'Control postoperatorio'], ['Cirugía', 'Extracción de cordal incluido'], ['Cirugía', 'Cirugía ortognática'], ['Cirugía', 'Reducción de fractura facial']] }),
  H({ value: 'radiologia', label: 'Radiología e imágenes', lema: 'Estudios de imagen solicitados, realizados y entregados.', tipos: ['Evaluación', 'Procedimiento'],
    campos: [o('estudio_imagen', 'Estudio', ['Rayos X', 'Ultrasonido', 'Tomografía', 'Resonancia', 'Mamografía', 'Fluoroscopía']), t('region', 'Región estudiada'), o('contraste', 'Contraste', ['Sin contraste', 'Con contraste oral', 'Con contraste intravenoso']), t('hallazgos', 'Hallazgos')],
    notas: 'Indicación del estudio, técnica, hallazgos e impresión diagnóstica…',
    servicios: [['Evaluación', 'Rayos X'], ['Evaluación', 'Ultrasonido'], ['Evaluación', 'Tomografía'], ['Evaluación', 'Resonancia magnética'], ['Evaluación', 'Mamografía']] }),
  H({ value: 'laboratorio', label: 'Laboratorio', lema: 'Muestras, exámenes y resultados de cada paciente.', tipos: ['Evaluación'],
    campos: [o('muestra', 'Muestra', ['Sangre', 'Orina', 'Heces', 'Esputo', 'Líquido', 'Tejido']), t('examenes', 'Exámenes solicitados'), o('ayuno_examen', 'Ayuno', ['Sí', 'No']), t('resultado', 'Resultado relevante')],
    notas: 'Indicación, condiciones de la toma, observaciones del resultado…',
    servicios: [['Evaluación', 'Biometría hemática'], ['Evaluación', 'Química sanguínea'], ['Evaluación', 'Examen general de orina'], ['Evaluación', 'Examen de heces'], ['Evaluación', 'Cultivo']] }),
  H({ value: 'fisioterapia', label: 'Fisioterapia y rehabilitación', lema: 'Sesiones, avances y rehabilitación de cada paciente.', tipos: ['Primera consulta', 'Seguimiento', 'Evaluación'],
    campos: [t('zona_tratada', 'Zona tratada'), LADO, n('sesion', 'Sesión número'), DOLOR, t('tecnica', 'Técnica aplicada'), t('objetivo_fisio', 'Objetivo')],
    notas: 'Valoración funcional, técnica aplicada, respuesta del paciente, tareas en casa…',
    servicios: [['Primera consulta', 'Valoración de fisioterapia'], ['Seguimiento', 'Sesión de fisioterapia'], ['Seguimiento', 'Terapia respiratoria'], ['Evaluación', 'Evaluación funcional']] }),
  H({ value: 'trabajo_social', label: 'Trabajo social', lema: 'Situación social, apoyos y gestiones de cada paciente.', tipos: ['Primera consulta', 'Seguimiento', 'Evaluación'],
    campos: [t('situacion', 'Situación social'), o('apoyo', 'Red de apoyo', ['Fuerte', 'Limitada', 'Sin red de apoyo']), o('cobertura', 'Cobertura', ['Ninguna', 'Seguro privado', 'IGSS', 'Convenio']), t('plan_intervencion', 'Plan de intervención'), n('seguimiento_social', 'Seguimiento número')],
    notas: 'Entrevista, situación familiar y económica, gestiones realizadas, plan…',
    servicios: [['Primera consulta', 'Entrevista de trabajo social'], ['Seguimiento', 'Seguimiento social'], ['Evaluación', 'Estudio socioeconómico']] }),
  H({ value: 'medicina_del_dolor', label: 'Medicina del dolor', lema: 'Dolor crónico: evaluación, bloqueos y seguimiento de cada paciente.', tipos: T_CONSULTA,
    campos: [DOLOR, t('zona_dolor', 'Zona del dolor'), o('tipo_dolor', 'Tipo de dolor', ['Nociceptivo', 'Neuropático', 'Mixto']), t('tratamiento', 'Tratamiento'), DIAG],
    notas: 'Características del dolor, respuesta al tratamiento, plan, indicaciones…',
    servicios: [['Primera consulta', 'Consulta de medicina del dolor'], ['Seguimiento', 'Control del dolor'], ['Procedimiento', 'Bloqueo nervioso'], ['Procedimiento', 'Infiltración'], ['Procedimiento', 'Radiofrecuencia']] }),
]

// The 10 base specialties of a hospital, in this order, then everything else alphabetically
const BASE_HOSPITAL = ['ginecologia', 'pediatria', 'general', 'medicina_interna', 'traumatologia', 'cirugia_general', 'anestesiologia', 'enfermeria', 'psicologia', 'emergencias']
export const CATALOGO_HOSPITAL = (() => {
  const todas = [...ESPECIALIDADES, ...ESPECIALIDADES_HOSPITAL]
  const base = BASE_HOSPITAL.map(k => todas.find(e => e.value === k))
  const resto = todas.filter(e => !BASE_HOSPITAL.includes(e.value)).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return [...base, ...resto]
})()
export const CLAVES_BASE_HOSPITAL = BASE_HOSPITAL

// Hospital accounts: especialidad = 'hospital'. Without a specialty on the appointment they behave like general medicine;
// with one (cita.departamento_id) the specialty's own definition drives the types, fields and services (see claveEspCita).
// Kept out of ESPECIALIDADES on purpose: that list is the clinic specialties shown in every picker.
export const HOSPITAL = {
  ...ESPECIALIDADES[0], value: 'hospital', label: 'Hospital', hospital: true,
  lema: 'Sus especialidades, médicos, quirófanos y camas en un solo lugar.',
}
export const esHospital = (v) => v === HOSPITAL.value

const OTRA = ESPECIALIDADES[0]
export const especialidad = (v) => (esHospital(v) ? HOSPITAL : CATALOGO_HOSPITAL.find(e => e.value === v) || OTRA)
// Definition of any catalogue key (general medicine when unknown)
export const especialidadDe = (clave) => CATALOGO_HOSPITAL.find(e => e.value === clave) || OTRA
// Catalogue key a hospital specialty (departamento) uses: its own, or the one a custom specialty copies
export const claveDeDepartamento = (dep) => (dep ? dep.clave || dep.base || 'general' : null)
// The key that drives an appointment's clinical content: its specialty in a hospital, otherwise today's value (the clinic's specialty)
export function claveEspCita(clinicaEsp, cita, departamentos) {
  if (!esHospital(clinicaEsp) || !cita?.departamento_id) return clinicaEsp
  const dep = (departamentos || []).find(d => d.id === cita.departamento_id)
  return dep ? claveDeDepartamento(dep) : clinicaEsp
}

// Consultation types offered when registering/editing (the current one is kept even if the specialty does not list it)
export const tiposDe = (v, actual) => {
  const t = especialidad(v).tipos
  return actual && !t.includes(actual) ? [...t, actual] : t
}

// "Escala de dolor (0 a 10): 6 · Pierna tratada: Ambas" for files and reports
export function resumenDatos(datos, v, buscarEnTodas = esHospital(v)) {
  if (!datos || typeof datos !== 'object') return ''
  const campos = especialidad(v).campos
  // a hospital file can hold fields of any specialty (the appointment may have changed specialty, or the public page does not know it): look the key up in the whole catalogue
  const etiqueta = (k) => campos.find(c => c.k === k) || (buscarEnTodas ? CATALOGO_HOSPITAL.flatMap(e => e.campos).find(c => c.k === k) : undefined)
  return Object.entries(datos)
    .filter(([, val]) => val !== '' && val != null)
    .map(([k, val]) => { const c = etiqueta(k); return c ? `${c.label}: ${val}${c.unidad ? ` ${c.unidad}` : ''}` : `${k}: ${val}` })
    .join(' · ')
}

// resumenDatos for one appointment: uses its specialty in a hospital, the clinic's specialty otherwise (identical to resumenDatos for clinics)
export const resumenDatosCita = (cita, clinicaEsp, departamentos) => resumenDatos(cita?.datos, claveEspCita(clinicaEsp, cita, departamentos), esHospital(clinicaEsp))
