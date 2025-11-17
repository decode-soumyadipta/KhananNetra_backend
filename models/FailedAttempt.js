import mongoose from 'mongoose';

const FailedAttemptSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true
  },
  email: String,
  eventType: {
    type: String,
    required: true,
    enum: [
      'login_failed',
      'mfa_failed', 
      'forgot_password_failed',
      'reset_code_failed',
      'token_refresh_failed',
      'user_not_found',
      'suspicious_activity',
      'invalid_session'
    ]
  },
  userAgent: String,
  details: mongoose.Schema.Types.Mixed,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Auto delete after 24 hours
  }
});

// Index for performance
FailedAttemptSchema.index({ ip: 1, createdAt: -1 });
FailedAttemptSchema.index({ email: 1, createdAt: -1 });
FailedAttemptSchema.index({ eventType: 1, createdAt: -1 });

// Static method to get recent attempts count
FailedAttemptSchema.statics.getRecentAttemptsCount = async function(ip, minutes, eventType = null) {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const query = { 
    ip, 
    createdAt: { $gt: cutoff } 
  };
  
  if (eventType) {
    query.eventType = eventType;
  }
  
  return await this.countDocuments(query);
};

// Static method to record security event
FailedAttemptSchema.statics.recordSecurityEvent = async function(ip, email, eventType, userAgent = null, details = {}) {
  return await this.create({
    ip,
    email,
    eventType,
    userAgent,
    details
  });
};

// Static method to get recent events by type
FailedAttemptSchema.statics.getRecentEventsByType = async function(ip, eventTypes, minutes = 15) {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  
  return await this.aggregate([
    {
      $match: {
        ip,
        eventType: { $in: eventTypes },
        createdAt: { $gt: cutoff }
      }
    },
    {
      $group: {
        _id: "$eventType",
        count: { $sum: 1 }
      }
    }
  ]);
};

export default mongoose.model('FailedAttempt', FailedAttemptSchema);