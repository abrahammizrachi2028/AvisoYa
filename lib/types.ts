export type Student = {
  id: string;
  nombre: string;
  grado: string;
  salon: string;
  tutor: string | null;
};

export type Urgencia = "normal" | "alta";

export type Announcement = {
  id: string;
  texto: string;
  lugar: string | null;
  hora_evento: string | null; // ISO
  urgencia: Urgencia;
  audiencia_desc: string;
  created_at: string;
};

export type EscalationAction = "resaltar" | "reenviar" | "tutor" | "ninguna";

export type Notification = {
  id: string;
  announcement_id: string;
  student_id: string;
  created_at: string;
  acknowledged_at: string | null;
  escalated: boolean;
  escalation_action: EscalationAction | null;
  escalation_reason: string | null;
};
