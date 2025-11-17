import mongoose from 'mongoose';

const BlockedIPSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  blockedAt: {
    type: Date,
    default: Date.now
  },
  blockedUntil: Date,
  reason: {
    type: String,
    required: true
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  email: String,
  attemptsCount: {
    type: Number,
    default: 0
  },
  eventTypes: [String]
});

// Static method to check if IP is blocked
BlockedIPSchema.statics.isIPBlocked = async function(ip) {
  const blocked = await this.findOne({
    ip,
    isActive: true,
    blockedUntil: { $gt: new Date() }
  });
  return !!blocked;
};

// Static method to block IP
BlockedIPSchema.statics.blockIP = async function(ip, reason, email = null, durationMinutes = 1440) {
  const blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
  
  return await this.findOneAndUpdate(
    { ip },
    {
      isActive: true,
      blockedAt: new Date(),
      blockedUntil,
      reason,
      email,
      $inc: { attemptsCount: 1 }
    },
    { upsert: true, new: true }
  );
};

// Static method to unblock IP
BlockedIPSchema.statics.unblockIP = async function(ip) {
  return await this.findOneAndUpdate(
    { ip },
    { 
      isActive: false,
      blockedUntil: new Date() 
    },
    { new: true }
  );
};

export default mongoose.model('BlockedIP', BlockedIPSchema);