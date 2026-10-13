import { WhatsAppMessageDirection } from '../../domain/ports/QrObserverPort'

export type { WhatsAppMessageDirection }

export interface WhatsAppMessageStats {
  incoming: number
  outgoing: number
  total: number
  updatedAt: string | null
}

/**
 * Estadísticas de los mensajes observados durante la ejecución
 * actual del servidor.
 *
 * No almacena el contenido de los mensajes ni los teléfonos.
 */
export class WhatsAppMessageStatsService {
  private incoming = 0
  private outgoing = 0
  private updatedAt: string | null = null

  record(direction: WhatsAppMessageDirection): WhatsAppMessageStats {
    if (direction === 'incoming') {
      this.incoming += 1
    } else {
      this.outgoing += 1
    }

    this.updatedAt = new Date().toISOString()

    return this.getSnapshot()
  }

  getSnapshot(): WhatsAppMessageStats {
    return {
      incoming: this.incoming,
      outgoing: this.outgoing,
      total: this.incoming + this.outgoing,
      updatedAt: this.updatedAt,
    }
  }
}
