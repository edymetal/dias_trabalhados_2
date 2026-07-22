import {
  createCipheriv,
  createDecipheriv
} from 'node:crypto';
import {
  appendFile,
  open,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('DTBKP001', 'ascii');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function readKey() {
  const encodedKey = process.env.DIAS_BACKUP_KEY;
  if (!encodedKey) {
    throw new Error('Defina DIAS_BACKUP_KEY com uma chave aleatória de 32 bytes em Base64.');
  }

  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedKey) {
    throw new Error('DIAS_BACKUP_KEY deve conter exatamente 32 bytes em Base64.');
  }

  return key;
}

async function encrypt(inputPath, outputPath, key) {
  const { randomBytes } = await import('node:crypto');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  await writeFile(outputPath, Buffer.concat([MAGIC, iv]), { flag: 'wx' });

  try {
    await pipeline(
      createReadStream(inputPath),
      cipher,
      createWriteStream(outputPath, { flags: 'a' })
    );
    await appendFile(outputPath, cipher.getAuthTag());
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
}

async function decrypt(inputPath, outputPath, key) {
  const inputStats = await stat(inputPath);
  const headerLength = MAGIC.length + IV_LENGTH;
  if (inputStats.size <= headerLength + TAG_LENGTH) {
    throw new Error('Arquivo criptografado inválido ou truncado.');
  }

  const handle = await open(inputPath, 'r');
  const header = Buffer.alloc(headerLength);
  const tag = Buffer.alloc(TAG_LENGTH);

  try {
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, inputStats.size - TAG_LENGTH);
  } finally {
    await handle.close();
  }

  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Assinatura do arquivo de backup não reconhecida.');
  }

  const iv = header.subarray(MAGIC.length);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    await pipeline(
      createReadStream(inputPath, {
        start: headerLength,
        end: inputStats.size - TAG_LENGTH - 1
      }),
      decipher,
      createWriteStream(outputPath, { flags: 'wx' })
    );
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
}

const [operation, inputPath, outputPath] = process.argv.slice(2);

if (!['encrypt', 'decrypt'].includes(operation) || !inputPath || !outputPath) {
  console.error('Uso: node scripts/backup-crypto.mjs <encrypt|decrypt> <entrada> <saída>');
  process.exit(2);
}

try {
  const key = readKey();
  if (operation === 'encrypt') {
    await encrypt(inputPath, outputPath, key);
  } else {
    await decrypt(inputPath, outputPath, key);
  }
  console.log(`${operation === 'encrypt' ? 'Criptografia' : 'Descriptografia'} concluída.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
