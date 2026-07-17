import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import { whatsappConfig, cloudinaryConfig } from '../config/whatsapp';

cloudinary.config({
  cloud_name: cloudinaryConfig.cloudName,
  api_key: cloudinaryConfig.apiKey,
  api_secret: cloudinaryConfig.apiSecret,
});

export class MediaService {
  // Descarga una imagen recibida por WhatsApp (identificada por su media id) y la
  // sube a Cloudinary para tener una URL durable — la URL que da la Graph API de
  // Meta expira a los pocos minutos, así que no sirve guardarla directamente.
  async descargarYSubir(mediaId: string): Promise<string> {
    const metaResponse = await axios.get(`${whatsappConfig.apiUrl}/${mediaId}`, {
      headers: { Authorization: `Bearer ${whatsappConfig.token}` },
      timeout: 10000,
    });
    const urlTemporal = metaResponse.data?.url;
    if (!urlTemporal) throw new Error('WhatsApp no devolvió una URL de descarga para el media id');

    const archivo = await axios.get(urlTemporal, {
      headers: { Authorization: `Bearer ${whatsappConfig.token}` },
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'serveloz/evidencias' },
        (error, result) => {
          if (error || !result) return reject(error || new Error('Cloudinary no devolvió resultado'));
          resolve(result.secure_url);
        }
      );
      uploadStream.end(Buffer.from(archivo.data));
    });
  }
}

export const mediaService = new MediaService();
