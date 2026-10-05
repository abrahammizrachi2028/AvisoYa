# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

DARK = HexColor("#0f1c2e")
ACCENT = HexColor("#0369a1")
GREY = HexColor("#52637a")

styles = getSampleStyleSheet()
title_style = ParagraphStyle("TitleX", parent=styles["Title"], textColor=DARK, fontSize=22, spaceAfter=2)
subtitle_style = ParagraphStyle("SubtitleX", parent=styles["Normal"], textColor=GREY, fontSize=11, spaceAfter=14)
meta_style = ParagraphStyle("MetaX", parent=styles["Normal"], textColor=GREY, fontSize=9.5, spaceAfter=18)
h2 = ParagraphStyle("H2", parent=styles["Heading2"], textColor=ACCENT, fontSize=13.5, spaceBefore=14, spaceAfter=6)
body = ParagraphStyle("BodyX", parent=styles["Normal"], fontSize=10.3, leading=15, alignment=TA_LEFT, spaceAfter=6)
bullet = ParagraphStyle("BulletX", parent=body, leftIndent=12, spaceAfter=4)

doc = SimpleDocTemplate(
    "AvisoYa_Nota.pdf", pagesize=letter,
    topMargin=2.2*cm, bottomMargin=2.2*cm, leftMargin=2.2*cm, rightMargin=2.2*cm,
    title="AvisoYa - Nota del proyecto", author="Abraham Mizrachi"
)

S = []


def h(text):
    S.append(Paragraph(text, h2))


def p(text):
    S.append(Paragraph(text, body))


def bullets(items):
    S.append(ListFlowable(
        [ListItem(Paragraph(t, bullet), bulletColor=ACCENT) for t in items],
        bulletType="bullet", start="•", leftIndent=14
    ))
    S.append(Spacer(1, 4))


S.append(Paragraph("AvisoYa", title_style))
S.append(Paragraph(
    "El horario de la escuela, vivo: cada cambio le llega al instante a quien le toca",
    subtitle_style
))
S.append(Paragraph(
    "Autor: Abraham Mizrachi &nbsp;|&nbsp; Grado: 10A &nbsp;|&nbsp; "
    "Desafío IA 2026 — AI Lab, Instituto Alberto Einstein",
    meta_style
))
S.append(HRFlowable(width="100%", thickness=0.8, color=GREY))

h("1. El problema")
p(
    "Los cambios de última hora — cambio de salón, una clase cancelada, salida temprana, una prueba "
    "que se agrega — hoy se comunican por grupos de WhatsApp mezclados con otros mensajes, por avisos en "
    "cartelera que nadie mira, o boca a boca. El resultado: uno se entera tarde, o no se entera, y nadie puede "
    "confirmar quién vio qué."
)
p(
    "Y el problema se multiplica porque el horario no es igual para todos: dos estudiantes del mismo salón "
    "tienen clases distintas según los AP en los que estén inscritos, así que un aviso para "
    "“todo 10A” casi nunca es cierto para todo 10A."
)

h("2. Alternativas consideradas y por qué esta")
p(
    "La opción obvia era un tablón de anuncios digital: alguien publica, todos leen. Resuelve la "
    "distribución pero no el problema real, que es la <b>precisión</b>: si el aviso no distingue entre "
    "quien toma AP Cálculo y quien toma Matemáticas MYP a la misma hora, sigue siendo ruido y la gente "
    "deja de leerlo."
)
p(
    "La segunda opción era un formulario estricto: el administrador elige día, período, salón y "
    "tipo de cambio en menús. Es preciso, pero lento. Un cambio como “el lunes hay salida temprana en "
    "toda la escuela” son decenas de clics, y por eso en la práctica nadie lo registraría: se "
    "volvería al WhatsApp."
)
p(
    "La decisión de diseño del proyecto es combinar las dos: <b>el administrador escribe en español "
    "normal y la IA traduce, pero el servidor verifica todo con reglas deterministas antes de aplicar nada.</b> "
    "La IA aporta velocidad donde un menú es lento; el código aporta certeza donde un modelo puede "
    "equivocarse. Ninguna de las dos partes hace el trabajo de la otra."
)

h("3. Qué hace la aplicación hoy")
bullets([
    "<b>Horario por persona, no por salón.</b> La base es la clase MYP; quien está inscrito en un AP ve "
    "su variante en esa celda. La inscripción es por materia, así que cada estudiante ve su horario real.",
    "<b>Nombres legibles.</b> El código interno de la escuela (<i>10 ESP MYP 26-A</i>) se muestra como "
    "“Español A”. Los códigos siguen intactos en la base de datos; solo cambia lo que se lee.",
    "<b>Calendario por semanas.</b> Cada semana tiene su propio estado. Se navega hacia adelante y hacia "
    "atrás, siempre abre en la semana actual, y un cambio de una semana no se arrastra a la siguiente.",
    "<b>Cambios de varias semanas.</b> “Cancelar Física los lunes hasta el 19 de octubre” se "
    "programa una vez y se aplica a cada lunes del rango; después se puede editar una sola semana sin tocar "
    "las demás.",
    "<b>Jornadas especiales.</b> “El lunes hay salida temprana” tacha todo lo posterior al almuerzo; "
    "“el lunes queda cancelada la escuela” tacha el día entero. Se avisa con una sola línea, "
    "no con veinte.",
    "<b>Avisos dirigidos.</b> A toda la escuela, a un grado, a un salón o a un estudiante concreto.",
    "<b>Notificaciones push reales.</b> La app es una PWA instalable: el aviso llega al teléfono aunque la "
    "app esté cerrada. El push solo dice que hay un cambio y el detalle se ve dentro, para no mostrar "
    "información en la pantalla de bloqueo.",
    "<b>Historial auditable.</b> Qué se envió, a quién, y quién lo marcó como visto.",
])

h("4. Dónde está la IA y cómo se la hace confiable")
p(
    "El modelo en producción es <b>Claude Haiku 4.5</b> y se usa en tres lugares: interpretar cambios de "
    "horario, redactar avisos, y decidir qué hacer con un aviso urgente que un estudiante no ha abierto "
    "(reenviar, avisar al tutor, dejarlo resaltado o esperar, según cuánto falta para el evento y si esa "
    "persona suele leer los avisos)."
)
p(
    "Lo interesante no fue conectar el modelo, sino hacerlo confiable. Cada problema que apareció se "
    "resolvió moviendo la decisión del modelo al servidor:"
)
bullets([
    "<b>No elige días ni horas: elige de una lista.</b> El servidor le pasa todas las clases numeradas con su "
    "salón, día, período y nombre legible. El modelo solo devuelve identificadores; las fechas las "
    "calcula el código.",
    "<b>Guardas deterministas.</b> El modelo copia el trozo literal del pedido que originó cada cambio. El "
    "servidor lee de ahí el día y la materia, y descarta el cambio si no coinciden. Así se "
    "detectó un fallo real: al pedir algo “el jueves en la hora de Hebreo” —día en que no "
    "hay Hebreo— el modelo colgaba la anotación de otra clase en silencio. Ahora lo rechaza y lo explica.",
    "<b>El contexto se envía escrito, no se recuerda.</b> Para ajustar una sugerencia (“ahora que sea el "
    "martes”), el servidor le devuelve su propia propuesta anterior como dato estructurado. Confiar en la "
    "memoria conversacional perdía cambios; con el estado explícito, no.",
    "<b>Errores y límites.</b> Tiempo máximo de espera, reintentos, detección de respuesta "
    "incompleta o vacía, y un mensaje distinto por cada tipo de fallo. La interfaz nunca queda cargando y se "
    "puede cancelar una consulta.",
])
p(
    "El sistema se valida con pruebas automatizadas que corren contra la aplicación real: instrucciones con "
    "varios requisitos, correcciones parciales, conversaciones de varios turnos, semanas, permisos y jornadas "
    "especiales."
)

h("5. Privacidad y uso responsable de la IA")
bullets([
    "El prototipo usa <b>exclusivamente datos ficticios</b>: los nombres del listado y los avisos de prueba son "
    "inventados. No se usaron datos reales de estudiantes, profesores ni familias, conforme a la regla del "
    "concurso.",
    "Los nombres de los profesores que aparecían en el horario original <b>no</b> se cargaron al sistema, "
    "justamente por esa regla.",
    "Las claves de la API y de la base de datos viven solo en el servidor; el navegador nunca las ve. El panel de "
    "administración está protegido en el servidor, no solo escondido en la interfaz.",
    "La IA nunca aplica un cambio sola: propone y el administrador confirma. Cada decisión de escalamiento "
    "queda registrada con su justificación, para poder auditarla.",
    "Si el proyecto pasara a uso real haría falta permiso escrito de la institución y de las familias, y "
    "una política clara de qué procesa la IA: metadatos del aviso y del horario, nunca contenido "
    "personal sensible.",
])

h("6. Viabilidad")
p(
    "Está desplegada y funcionando, no es una maqueta. Corre sobre infraestructura gratuita para este "
    "tamaño (Vercel y Supabase) y el único costo variable es la API del modelo — se eligió "
    "Haiku 4.5, el más económico, porque la tarea no necesita más. Adoptarla en la escuela "
    "requiere cargar el horario real y crear las cuentas; la lógica ya contempla los AP, los grupos mixtos y "
    "los dos salones por grado."
)

h("7. Herramientas de IA utilizadas")
bullets([
    "<b>Claude Code (Anthropic)</b>, con los modelos Claude Sonnet 5 y Claude Opus 5 — usado para construir "
    "la aplicación completa: interfaz, servidor, base de datos y pruebas.",
    "<b>API de Claude (Anthropic), modelo Claude Haiku 4.5</b> — integrada dentro de la app en "
    "producción, para interpretar cambios de horario, redactar avisos y decidir el escalamiento de avisos "
    "urgentes no vistos.",
])

h("8. Link a la aplicación")
p('<b><a href="https://avisoya.vercel.app" color="#0369a1">https://avisoya.vercel.app</a></b>')
p(
    "Para entrar como estudiante basta el usuario del correo escolar (por ejemplo <i>abraham.mizrachi</i>); el "
    "dominio @IAE.edu lo agrega la app. En esta versión de demostración no se valida la identidad "
    "todavía: la arquitectura ya está preparada para añadir la verificación por código."
)

doc.build(S)
print("PDF generado")
