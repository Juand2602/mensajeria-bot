export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: { body: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  type: string;
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        messages?: WhatsAppMessage[];
        statuses?: any[];
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      };
      field: string;
    }>;
  }>;
}

export type ConversationState =
  | 'INICIAL'
  | 'ESPERANDO_NOMBRE'
  | 'ESPERANDO_REFERIDO'
  | 'ESPERANDO_TIPO_SERVICIO'
  | 'ESPERANDO_RECOGIDA'
  | 'ESPERANDO_CONFIRMACION_RECOGIDA'
  | 'ESPERANDO_DESTINO'
  | 'ESPERANDO_CONFIRMACION_DESTINO'
  | 'ESPERANDO_MOMENTO'
  | 'ESPERANDO_FECHA_HORA_PROGRAMADA'
  | 'CONFIRMACION_PRECIO'
  | 'ESPERANDO_ASIGNACION'
  | 'ESPERANDO_SELECCION_CARRERA_CANCELAR'
  | 'ESPERANDO_CONFIRMACION_CANCELACION'
  | 'COMPLETADA';

export interface DireccionPendiente {
  direccionTexto?: string;
  direccionFormateada?: string;
  lat?: number;
  lng?: number;
}

export interface ConversationContext {
  nombre?: string;
  referidoTelefono?: string;
  tipoServicio?: 'DOMICILIO' | 'MOTOTAXI';
  recogida?: DireccionPendiente;
  destino?: DireccionPendiente;
  fechaHoraProgramada?: string;
  distanciaKm?: number;
  precio?: number;
  carreraId?: string;
  radicado?: string;
  carrerasDisponibles?: Array<{
    numero: number;
    radicado: string;
    tipoServicio: string;
    destino: string;
  }>;
}
