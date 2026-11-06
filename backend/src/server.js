import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url) });
const { default: app } = await import('./app.js');

const port = Number(process.env.PORT || 5000);
try {
  if (process.env.NODE_ENV === 'production' && (process.env.AUTH_MODE !== 'jwt' || !process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32)) {
    throw new Error('Production requires JWT mode and a JWT_SECRET of at least 32 bytes.');
  }
  if (process.env.AUTH_MODE === 'development' && ![undefined, 'development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('Development identity is allowed only in local development or tests.');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  app.listen(port, () => console.log(`Dev Mode API listening on ${port}`));
} catch (error) {
  console.error(`Startup failed: ${error.message.startsWith('Production requires') || error.message.startsWith('Development identity') || error.message === 'MONGODB_URI is required.' ? error.message : 'database connection could not be established.'}`);
  process.exitCode = 1;
}
