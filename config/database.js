import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Create initial admin user only
    await createInitialAdmin();
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const createInitialAdmin = async () => {
  try {
    const User = (await import('../models/User.js')).default;
    const VerifierRegistry = (await import('../models/VerifierRegistry.js')).default;
    
    // Check if super admin already exists
    const existingAdmin = await User.findOne({ email: 'superadmin@khanannetra.gov.in' });
    
    if (!existingAdmin) {
      console.log('👨‍💼 Creating initial super admin user...');
      
      // Create super admin user
      const superAdmin = await User.create({
        name: 'Super Administrator',
        email: 'superadmin@khanannetra.gov.in',
        phone: '+910000000000',
        password: 'Admin@123',
        designation: 'System Administrator',
        department: 'NTRO',
        isVerified: true,
        isActive: true
      });

      // Create verifier registry entry with system_super_admin role
      await VerifierRegistry.create({
        userId: superAdmin._id,
        name: 'Super Administrator',
        email: 'superadmin@khanannetra.gov.in',
        phone: '+910000000000',
        designation: 'System Administrator',
        department: 'NTRO',
        employeeId: 'SA001',
        states: [
          {
            stateName: 'National',
            stateCode: 'NATIONAL',
            region: 'central',
            isActive: true,
            districts: [
              {
                districtName: 'All Districts',
                districtCode: 'ALL',
                category: 'mining_intensive',
                isActive: true,
                activatedAt: new Date()
              }
            ],
            roles: [
              {
                role: 'system_super_admin',
                description: 'Full system administrator with all permissions',
                level: 7,
                category: 'system',
                roleStatus: 'active',
                isActive: true,
                assignedAt: new Date(),
                createdBy: superAdmin._id,
                permissions: [] // Empty because super admin gets all permissions automatically
              }
            ],
            stateConfig: {
              maxMiningArea: 1000,
              reportingFrequency: 'monthly',
              complianceThreshold: 0.95,
              environmentalRules: {
                waterBodyProtection: true,
                forestAreaRestricted: true
              }
            },
            performance: {
              totalDetections: 0,
              violationRate: 0,
              avgProcessingTime: 0
            }
          }
        ],
        globalVerificationLevel: 5,
        accessTier: 'ntro_privileged',
        security: {
          mfaEnabled: true,
          lastPasswordChange: new Date(),
          passwordExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
          failedLoginAttempts: 0
        },
        lastAccess: {
          timestamp: new Date(),
          ipAddress: '127.0.0.1',
          userAgent: 'System'
        },
        status: 'active',
        approvedBy: superAdmin._id,
        approvedAt: new Date()
      });

      console.log('✅ Initial super admin created successfully');
      console.log('📧 Email: superadmin@khanannetra.gov.in');
      console.log('🔑 Password: Admin@123');
      console.log('🎯 Role: System Super Admin (Level 7)');
      console.log('🌍 Access: National Level');
    } else {
      console.log('✅ Super admin already exists');
    }
  } catch (error) {
    console.error('❌ Error creating initial admin:', error);
  }
};

export default connectDB;