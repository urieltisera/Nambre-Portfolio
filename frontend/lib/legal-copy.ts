import {LegalDocumentType} from "@/lib/api";

export type LegalSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type LegalDocumentCopy = {
  path: string;
  shortTitle: string;
  title: string;
  summary: string;
  lead: string;
  note?: string;
  sections: LegalSection[];
};

export const LEGAL_LAST_UPDATED = "24 de agosto de 2026";
export const LEGAL_VERSION = "2026-08-24";

export const LEGAL_DOCUMENT_ORDER: LegalDocumentType[] = [
  "terms",
  "privacy",
  "acceptable_use",
  "cookies_analytics",
  "ai_policy",
];

export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentType, string> = {
  acceptable_use: "Uso aceptable",
  ai_policy: "Política de IA",
  cookies_analytics: "Cookies y analítica",
  privacy: "Privacidad",
  terms: "Términos",
};

export const LEGAL_DOCUMENT_COPY: Record<LegalDocumentType, LegalDocumentCopy> = {
  terms: {
    lead:
      "Estos términos regulan el acceso y uso operativo de Nambre durante su piloto en Argentina. Se publican para uso real y revisión posterior con asesoramiento profesional independiente.",
    path: "/terms",
    shortTitle: "Términos",
    summary:
      "Condiciones de uso del servicio Nambre, cuentas, QR dinámico, cartas alojadas o externas, límites razonables de responsabilidad y reglas aplicables en Argentina.",
    title: "Términos y Condiciones",
    note:
      "Nambre presta una herramienta tecnológica para publicar y actualizar destinos de carta digital. No reemplaza obligaciones regulatorias, fiscales o sanitarias propias de cada negocio.",
    sections: [
      {
        heading: "1. Identificación del servicio",
        paragraphs: [
          "Nambre es un servicio digital orientado a negocios gastronómicos y comercios que necesitan publicar una carta o destino digital accesible mediante un QR dinámico.",
          "Salvo indicación distinta en una propuesta comercial o comunicación operativa, la referencia a Nambre en este documento identifica al servicio y al equipo operador que administra la plataforma durante el piloto.",
        ],
      },
      {
        heading: "2. Objeto del servicio",
        paragraphs: [
          "El servicio permite crear y administrar un negocio, asociarle una carta alojada en PDF o una URL externa, generar un QR dinámico y consultar analítica básica de accesos.",
          "Nambre puede modificar aspectos operativos, visuales o técnicos del servicio para mantener seguridad, continuidad, compatibilidad o correcciones razonables durante el piloto.",
        ],
      },
      {
        heading: "3. Cuentas y acceso",
        paragraphs: [
          "El acceso se realiza mediante cuentas individuales con email y contraseña o por invitación administrativa. Cada negocio es responsable por mantener la confidencialidad de sus credenciales y por restringir el acceso solo a personal autorizado.",
          "La cuenta podrá requerir aceptación de la versión legal vigente antes de habilitar funciones operativas. Nambre puede invalidar sesiones, exigir restablecimiento de contraseña o suspender credenciales ante indicios razonables de uso no autorizado.",
        ],
      },
      {
        heading: "4. Obligaciones del negocio",
        paragraphs: [
          "El negocio debe cargar información exacta, mantener actualizados sus datos básicos y usar el servicio de manera lícita, diligente y acorde a la finalidad comercial prevista.",
        ],
        bullets: [
          "Asegurar que el contenido publicado sea propio o cuente con autorización suficiente.",
          "Verificar que la carta, logos, precios, promociones y URLs externas sean correctos antes de publicarlos.",
          "Responder por el uso de la cuenta por parte de sus administradores, empleados o terceros autorizados.",
        ],
      },
      {
        heading: "5. Contenido cargado por el cliente",
        paragraphs: [
          "El negocio conserva la responsabilidad sobre los archivos, imágenes, marcas, textos, enlaces y demás contenido que cargue o vincule mediante Nambre.",
          "Cuando el negocio usa una URL externa como destino, Nambre solo actúa como capa de redirección dinámica y no controla de forma permanente la disponibilidad, seguridad o contenido del sitio de destino.",
        ],
      },
      {
        heading: "6. Propiedad intelectual",
        paragraphs: [
          "La plataforma, su diseño, software, marcas, documentación y materiales propios de Nambre pertenecen a Nambre o a sus licenciantes y están protegidos por la normativa aplicable.",
          "El negocio mantiene la titularidad de sus logos, cartas, PDFs y demás activos propios, y autoriza a Nambre a alojarlos, procesarlos y exhibirlos en la medida necesaria para prestar el servicio.",
        ],
      },
      {
        heading: "7. Disponibilidad del servicio",
        paragraphs: [
          "Nambre procurará una disponibilidad razonable, pero el servicio se ofrece durante una etapa piloto y puede experimentar mantenimientos, interrupciones, limitaciones temporales o cambios operativos.",
          "No se garantiza funcionamiento ininterrumpido ni ausencia absoluta de errores, especialmente cuando existan dependencias de terceros como correo electrónico, hosting, navegadores, dispositivos móviles o conectividad externa.",
        ],
      },
      {
        heading: "8. QR dinámico, cartas alojadas y destinos externos",
        paragraphs: [
          "El QR dinámico busca conservar una misma referencia pública aun cuando cambie la carta PDF o la URL externa configurada por el negocio.",
          "Nambre puede almacenar versiones históricas de cartas y cambios de destino con fines operativos, de auditoría, rollback y soporte. La permanencia del historial dependerá de la política interna de retención y del estado operativo del piloto.",
        ],
        bullets: [
          "Si el negocio reemplaza el PDF o la URL externa, el mismo QR podrá seguir apuntando al destino vigente configurado.",
          "Si el destino externo deja de existir, redirige a un sitio inseguro o incumple estas condiciones, Nambre podrá deshabilitarlo preventivamente.",
        ],
      },
      {
        heading: "9. Uso indebido, suspensión y cancelación",
        paragraphs: [
          "Nambre puede suspender o cancelar accesos, negocios, QR o contenidos cuando detecte incumplimientos legales o contractuales, riesgo para usuarios finales, reclamos de terceros, abuso técnico o fraude.",
          "En la medida razonablemente posible, Nambre procurará informar la medida y su motivo, salvo que hacerlo pueda agravar el riesgo, afectar evidencia o comprometer la seguridad del servicio.",
        ],
      },
      {
        heading: "10. Limitación de responsabilidad",
        paragraphs: [
          "Nambre responde por la prestación del servicio con un estándar de diligencia comercial razonable, pero no garantiza resultados comerciales específicos, volumen de ventas, posicionamiento, escaneos mínimos ni continuidad absoluta de servicios de terceros.",
          "En la máxima medida permitida por la legislación aplicable, Nambre no será responsable por daños indirectos, lucro cesante, pérdida de oportunidad o perjuicios derivados del contenido cargado por el negocio, de fallas de proveedores externos o del uso indebido de credenciales.",
        ],
      },
      {
        heading: "11. Cambios del servicio o de estos términos",
        paragraphs: [
          "Nambre puede actualizar funcionalidades existentes, interfaces, documentación y términos legales cuando resulte necesario por razones operativas, técnicas, comerciales o regulatorias.",
          "Cuando una nueva versión legal entre en vigencia, la plataforma podrá requerir una nueva aceptación antes de permitir el acceso continuo, conforme al mecanismo de versionado implementado.",
        ],
      },
      {
        heading: "12. Contacto, ley aplicable y jurisdicción",
        paragraphs: [
          "Consultas operativas, solicitudes vinculadas al servicio o comunicaciones sobre estos términos pueden dirigirse por los canales informados por el equipo de Nambre durante el piloto.",
          "Estos términos se interpretan conforme a las leyes de la República Argentina. Cualquier controversia se someterá a la jurisdicción ordinaria con competencia en Argentina, salvo norma imperativa en contrario.",
        ],
      },
    ],
  },
  privacy: {
    lead:
      "Esta política describe el tratamiento operativo de datos personales y datos de negocio que Nambre realiza durante su piloto en Argentina, con criterio de minimización y revisión profesional posterior.",
    path: "/privacy",
    shortTitle: "Privacidad",
    summary:
      "Datos recolectados, finalidades, seguridad, proveedores, conservación, derechos de titulares y tratamiento de archivos, logos, analítica y logs técnicos.",
    title: "Política de Privacidad",
    note:
      "El alcance de esta política se limita a los tratamientos actualmente identificados en el producto. Si Nambre incorpora nuevos tratamientos relevantes, publicará una versión legal actualizada.",
    sections: [
      {
        heading: "1. Datos que podemos recolectar",
        paragraphs: [
          "Nambre puede recolectar datos de cuenta como email, credenciales cifradas, registros de sesión, eventos de aceptación legal y trazas necesarias para autenticación y auditoría.",
          "También puede procesar datos operativos del negocio, como nombre comercial, slug, logos, PDFs de carta, URLs externas configuradas, historial de versiones y metadatos asociados a esos activos.",
        ],
        bullets: [
          "Datos de cuenta: email, hashes de contraseña, tokens de sesión y eventos de acceso.",
          "Datos del negocio: nombre, slug, estado, destino de carta, logos, PDFs y configuración pública.",
          "Datos de uso: scans del QR, fecha y hora, negocio asociado, código público y métricas agregadas.",
          "Logs técnicos: errores, eventos de API, auditoría, rate limits y señales básicas de seguridad.",
        ],
      },
      {
        heading: "2. Finalidad del tratamiento",
        paragraphs: [
          "Tratamos los datos para habilitar el acceso al servicio, administrar negocios, publicar la carta o destino configurado, generar QR dinámicos, medir accesos, responder incidencias y mantener trazabilidad básica de seguridad.",
          "La información también puede usarse para soporte operativo, prevención de abuso, mejora del producto existente y cumplimiento de obligaciones legales o requerimientos válidos de autoridad competente.",
        ],
      },
      {
        heading: "3. Archivos, logos y URLs externas",
        paragraphs: [
          "Cuando el negocio carga un PDF o logo, Nambre lo almacena en la infraestructura configurada para poder servirlo o administrarlo dentro del producto.",
          "Cuando el negocio configura una URL externa, Nambre guarda esa referencia para el funcionamiento del QR dinámico y para conservar historial de cambios, pero no administra el contenido del sitio externo.",
        ],
      },
      {
        heading: "4. Analítica y registros técnicos",
        paragraphs: [
          "Nambre registra eventos de escaneo del QR y métricas agregadas para mostrar analítica básica al negocio y monitorear el uso del servicio.",
          "Los logs técnicos y de auditoría pueden incluir identificadores de usuario, negocio, timestamps, tipo de evento, estados de autenticación y errores. Esos registros se usan para seguridad, soporte, prevención de fraude y diagnóstico.",
        ],
      },
      {
        heading: "5. Base operativa, conservación y minimización",
        paragraphs: [
          "Nambre conserva los datos por el tiempo necesario para prestar el servicio, cumplir finalidades operativas razonables, resolver incidentes, sostener auditoría básica y atender exigencias legales aplicables.",
          "Cuando un dato deja de ser necesario, Nambre puede eliminarlo, anonimizarlo o conservarlo bloqueado solo por el plazo que resulte razonable o exigible.",
        ],
      },
      {
        heading: "6. Seguridad",
        paragraphs: [
          "Nambre aplica medidas técnicas y organizativas razonables para proteger la confidencialidad, integridad y disponibilidad de la información, incluyendo control de acceso, hashing de contraseñas, versionado legal, auditoría y separación básica entre datos públicos y privados.",
          "Ningún sistema es completamente inmune. Por eso, ante incidentes o sospechas de acceso indebido, Nambre podrá invalidar sesiones, suspender accesos y aplicar medidas adicionales de contención.",
        ],
      },
      {
        heading: "7. Proveedores y transferencias operativas",
        paragraphs: [
          "Para operar el servicio, Nambre puede apoyarse en proveedores de hosting, base de datos, almacenamiento, correo electrónico transaccional, monitoreo y herramientas de desarrollo u operación.",
          "Nambre procura seleccionar proveedores razonables para la etapa piloto y compartir con ellos únicamente la información necesaria para la prestación técnica del servicio.",
        ],
      },
      {
        heading: "8. Derechos del titular",
        paragraphs: [
          "Las personas titulares de datos personales pueden solicitar acceso, actualización, rectificación o supresión de la información que corresponda, dentro de los límites legales y operativos aplicables.",
          "También pueden solicitar corrección o eliminación cuando el dato resulte inexacto, excesivo o ya no sea necesario para la finalidad informada, sujeto a obligaciones de conservación legal o de seguridad.",
        ],
      },
      {
        heading: "9. Contacto y gestión de solicitudes",
        paragraphs: [
          "Las consultas o solicitudes sobre privacidad pueden canalizarse a través del contacto operativo informado por Nambre durante el piloto.",
          "Para proteger cuentas y evidencia operativa, Nambre podrá requerir validaciones mínimas de identidad antes de ejecutar cambios, correcciones o eliminaciones sobre datos vinculados al servicio.",
        ],
      },
    ],
  },
  acceptable_use: {
    lead:
      "Esta política define usos permitidos y prohibidos del servicio para proteger a los negocios, a sus clientes finales y a la infraestructura de Nambre.",
    path: "/acceptable-use",
    shortTitle: "Uso aceptable",
    summary:
      "Prohibiciones sobre contenido ilegal, phishing, malware, abuso técnico, fraude, suplantación y enlaces externos maliciosos, con posibilidad de suspensión inmediata.",
    title: "Política de Uso Aceptable",
    sections: [
      {
        heading: "1. Uso permitido",
        paragraphs: [
          "Nambre debe usarse para administrar y publicar cartas o destinos digitales legítimos de un negocio autorizado por quien opera la cuenta.",
        ],
      },
      {
        heading: "2. Usos prohibidos",
        paragraphs: [
          "Queda prohibido utilizar Nambre para actividades ilícitas, engañosas, abusivas o que comprometan la seguridad de terceros o de la plataforma.",
        ],
        bullets: [
          "Publicar o distribuir contenido ilegal, difamatorio, discriminatorio, fraudulento o que infrinja derechos de terceros.",
          "Usar QR, PDFs o URLs externas para phishing, malware, spam, suplantación de identidad o captura indebida de credenciales.",
          "Subir archivos dañinos, intentar explotar vulnerabilidades, evadir controles de acceso, automatizar abuso o degradar la disponibilidad del servicio.",
          "Presentar como oficiales marcas, sitios o comunicaciones que no cuenten con autorización suficiente.",
          "Usar el servicio para redirigir a destinos engañosos, peligrosos o materialmente distintos de los informados al cliente final.",
        ],
      },
      {
        heading: "3. Cumplimiento y medidas",
        paragraphs: [
          "Nambre puede investigar señales de abuso y aplicar medidas preventivas o definitivas, incluyendo suspensión de cuentas, desactivación de QR, retiro de contenido, invalidación de sesiones y preservación de evidencia técnica.",
          "Cuando el incidente involucre riesgo para terceros, Nambre podrá actuar sin aviso previo y coordinar con proveedores o autoridades según corresponda.",
        ],
      },
    ],
  },
  cookies_analytics: {
    lead:
      "Esta política resume el uso actual de cookies, sesiones y medición básica asociada al producto y al QR dinámico de Nambre.",
    path: "/cookies-analytics",
    shortTitle: "Cookies y analítica",
    summary:
      "Cookies de sesión, autenticación HttpOnly, métricas de escaneo, finalidad de la analítica y distinción entre cookies necesarias y medición operativa.",
    title: "Política de Cookies y Analítica",
    sections: [
      {
        heading: "1. Cookies necesarias",
        paragraphs: [
          "Nambre utiliza mecanismos técnicos de sesión necesarios para autenticar usuarios, mantener la cuenta activa y proteger el acceso al panel.",
          "Cuando corresponda, la sesión puede apoyarse en cookies o tokens con atributos de seguridad, incluyendo cookies HttpOnly destinadas a autenticación o continuidad de sesión.",
        ],
      },
      {
        heading: "2. Analítica operativa",
        paragraphs: [
          "Nambre registra escaneos del QR y otros eventos mínimos necesarios para informar analítica básica al negocio y monitorear el funcionamiento del redirect público.",
        ],
        bullets: [
          "Qué se mide: fecha y hora del scan, negocio asociado, código público y métricas agregadas de uso.",
          "Finalidad: conocer accesos, validar funcionamiento del QR dinámico y contar con trazabilidad básica para soporte y seguridad.",
          "Límite: Nambre no vende estos datos ni usa la analítica para redes publicitarias de terceros dentro del alcance actual del piloto.",
        ],
      },
      {
        heading: "3. Distinción entre lo necesario y lo analítico",
        paragraphs: [
          "Las cookies o mecanismos estrictamente necesarios se usan para que la autenticación y la operación del producto funcionen correctamente.",
          "La analítica actual es esencialmente operativa y se orienta a los escaneos del QR y al diagnóstico del servicio. Si en el futuro se incorporan herramientas analíticas adicionales, Nambre actualizará esta política en una nueva versión.",
        ],
      },
    ],
  },
  ai_policy: {
    lead:
      "Esta política aclara el alcance actual del uso de inteligencia artificial dentro de Nambre y evita atribuir funcionalidades que el producto no ofrece hoy.",
    path: "/ai-policy",
    shortTitle: "Política de IA",
    summary:
      "Estado actual del producto respecto a IA, ausencia de procesamiento de datos del cliente con IA generativa y posibilidad de actualización futura mediante nueva versión legal.",
    title: "Política de IA",
    sections: [
      {
        heading: "1. Estado actual",
        paragraphs: [
          "A la fecha de esta versión legal, Nambre no ofrece en producción funcionalidades de generación automática de cartas, clasificación de contenido, OCR, recomendación algorítmica ni procesamiento de PDFs o datos del cliente mediante IA generativa dentro del producto.",
          "En consecuencia, los documentos, logos, URLs y datos de negocio cargados por clientes no se procesan con sistemas de IA como parte del flujo operativo actualmente implementado en esta etapa piloto.",
        ],
      },
      {
        heading: "2. Alcance de esta política",
        paragraphs: [
          "Esta política describe únicamente el estado real del producto hoy. No constituye un anuncio de roadmap ni una promesa de incorporación futura de IA.",
          "Si Nambre incorpora funciones de IA que impliquen nuevos tratamientos de datos, automatizaciones relevantes o decisiones asistidas, publicará una nueva versión legal antes de habilitarlas en producción.",
        ],
      },
    ],
  },
};
