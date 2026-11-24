import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

/**
 * Traduce los errores de las bases de datos a respuestas HTTP controladas, para que el
 * frontend siempre reciba { statusCode, message } y pueda mostrar el mensaje al usuario.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: any, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const { status, message } = this.translate(exception);
    if (status >= 500) {
      this.logger.error(exception?.message ?? exception, exception?.stack);
    }
    response.status(status).json({ statusCode: status, message });
  }

  private translate(exception: any): { status: number; message: string | string[] } {
    if (exception instanceof HttpException) {
      const body: any = exception.getResponse();
      return { status: exception.getStatus(), message: body?.message ?? exception.message };
    }

    // PostgreSQL: RAISE EXCEPTION de funciones/triggers (reglas de negocio)
    if (exception?.code === 'P0001') {
      return { status: HttpStatus.UNPROCESSABLE_ENTITY, message: exception.message };
    }
    if (exception?.code === '23505') {
      return { status: HttpStatus.CONFLICT, message: 'El registro ya existe' };
    }
    if (exception?.code === '23P01') {
      return { status: HttpStatus.CONFLICT, message: 'El período se superpone con una suscripción existente' };
    }
    if (typeof exception?.code === 'string' && /^(08|57P)/.test(exception.code)) {
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'La base de datos relacional no está disponible' };
    }

    // MongoDB
    if (exception?.code === 121) {
      return { status: HttpStatus.BAD_REQUEST, message: 'El documento no cumple la validación de MongoDB' };
    }
    if (exception?.code === 11000) {
      return { status: HttpStatus.CONFLICT, message: 'El registro ya existe' };
    }
    const name: string = exception?.name ?? '';
    if (/^Mongo(ServerSelection|Network|NotConnected|Topology)/.test(name)) {
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'La base de datos del catálogo no está disponible' };
    }

    // Conexión caída (pg o mongo)
    if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].includes(exception?.code)) {
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'Un servicio de datos no está disponible' };
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Error interno del servidor' };
  }
}
