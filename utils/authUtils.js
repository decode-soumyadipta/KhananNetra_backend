import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

export const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

export const createHashedToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const generateRandomToken = () => {
  return crypto.randomBytes(32).toString('hex');
};