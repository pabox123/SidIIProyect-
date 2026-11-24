import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export const CONTENT_ID_PATTERN = /^(mov|ser|doc)_[0-9]{6,}$/;
export const EPISODE_ID_PATTERN = /^epi_[0-9]{6,}$/;

@Injectable()
export class ContentIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!CONTENT_ID_PATTERN.test(value)) {
      throw new BadRequestException('Identificador de contenido no válido');
    }
    return value;
  }
}
