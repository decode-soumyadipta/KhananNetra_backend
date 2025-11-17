import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { AvailablePermission } from '../models/VerifierRegistry.js';

dotenv.config();

const FIXED_PERMISSIONS = [
  // Fixed permission keys (removed numbers)
  {
    permissionKey: 'VISUALIZATION_CREATE', // Fixed from VISUALIZATION_3D_CREATE
    module: 'mining_operations',
    resource: '3d_visualization',
    action: 'create',
    category: 'technical',
    scope: 'state',
    severityLevel: 'medium',
    isSystemPermission: true,
    description: 'Create 3D visualizations of mining areas'
  },
  {
    permissionKey: 'VISUALIZATION_VIEW', // Fixed from VISUALIZATION_3D_VIEW
    module: 'mining_operations',
    resource: '3d_visualization',
    action: 'read',
    category: 'technical',
    scope: 'state',
    severityLevel: 'low',
    isSystemPermission: true,
    description: 'View 3D mining visualizations'
  }
];

const fixPermissions = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    console.log('🔄 Fixing problematic permissions...');
    
    let createdCount = 0;
    let updatedCount = 0;

    for (const permissionData of FIXED_PERMISSIONS) {
      try {
        // Check if permission already exists with the fixed key
        const existingPermission = await AvailablePermission.findOne({
          permissionKey: permissionData.permissionKey
        });

        if (existingPermission) {
          console.log(`✅ Already exists: ${permissionData.permissionKey}`);
        } else {
          // Create new permission with fixed key
          await AvailablePermission.create(permissionData);
          createdCount++;
          console.log(`✅ Created: ${permissionData.permissionKey}`);
        }

        // Also check if old invalid permissions exist and remove them
        const oldKey3DCreate = 'VISUALIZATION_3D_CREATE';
        const oldKey3DView = 'VISUALIZATION_3D_VIEW';
        
        const oldPermissionCreate = await AvailablePermission.findOne({
          permissionKey: oldKey3DCreate
        });
        
        const oldPermissionView = await AvailablePermission.findOne({
          permissionKey: oldKey3DView
        });

        if (oldPermissionCreate) {
          await AvailablePermission.deleteOne({ permissionKey: oldKey3DCreate });
          console.log(`🗑️  Deleted invalid permission: ${oldKey3DCreate}`);
        }

        if (oldPermissionView) {
          await AvailablePermission.deleteOne({ permissionKey: oldKey3DView });
          console.log(`🗑️  Deleted invalid permission: ${oldKey3DView}`);
        }

      } catch (error) {
        console.error(`❌ Error processing ${permissionData.permissionKey}:`, error.message);
      }
    }

    console.log('\n📊 Fix Permissions Summary:');
    console.log(`✅ Created: ${createdCount} new fixed permissions`);
    console.log(`🔄 Processed: ${FIXED_PERMISSIONS.length} permissions total`);

    // Verify the fixes
    console.log('\n🔍 Verifying fixed permissions:');
    const verifiedPermissions = await AvailablePermission.find({
      permissionKey: { $in: ['VISUALIZATION_CREATE', 'VISUALIZATION_VIEW'] }
    });

    console.log('✅ Verified permissions in database:');
    verifiedPermissions.forEach(perm => {
      console.log(`   - ${perm.permissionKey}: ${perm.description}`);
    });

    console.log('\n🎉 Permission fixes completed!');
    
  } catch (error) {
    console.error('❌ Error during permission fixes:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔗 MongoDB connection closed');
  }
};

// Run the fix
fixPermissions();