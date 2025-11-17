import express from 'express';
import mongoose from 'mongoose';
import { protect, requirePermission, superAdminOnly, requireModuleAccess } from '../middleware/auth.js';
import AppError from '../utils/appError.js';
import User from '../models/User.js';
import VerifierRegistry, { AvailablePermission } from '../models/VerifierRegistry.js';

const router = express.Router();

// ==================== AVAILABLE PERMISSIONS MANAGEMENT ====================

// Get all available permissions (for admin panel)
router.get('/available-permissions', 
  protect, 
  requirePermission('role_management', 'read'),
  async (req, res, next) => {
    try {
      const { module, category, isActive } = req.query;
      
      const filter = {};
      if (module) filter.module = module;
      if (category) filter.category = category;
      if (isActive !== undefined) filter.isActive = isActive === 'true';
      
      const permissions = await AvailablePermission.find(filter)
        .sort({ module: 1, resource: 1, action: 1 });

      res.status(200).json({
        status: 'success',
        data: {
          permissions,
          modules: await AvailablePermission.distinct('module'),
          categories: await AvailablePermission.distinct('category')
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Create new available permission (system-level)
router.post('/available-permissions',
  protect,
  superAdminOnly(),
  async (req, res, next) => {
    try {
      const {
        permissionKey,
        module,
        resource,
        action,
        category,
        scope,
        severityLevel,
        description,
        isSystemPermission = false,
        requiresSuperAdmin = false
      } = req.body;

      // Validate required fields
      if (!permissionKey || !module || !resource || !action || !category || !description) {
        return next(new AppError('All fields are required', 400));
      }

      const newPermission = await AvailablePermission.create({
        permissionKey,
        module,
        resource,
        action,
        category,
        scope: scope || 'state',
        severityLevel: severityLevel || 'medium',
        description,
        isSystemPermission,
        requiresSuperAdmin,
        autoGrantToSuperAdmin: true,
        createdBy: req.user.id
      });

      res.status(201).json({
        status: 'success',
        message: 'Permission created successfully',
        data: {
          permission: newPermission
        }
      });
    } catch (error) {
      if (error.code === 11000) {
        return next(new AppError('Permission key already exists', 400));
      }
      next(error);
    }
  }
);

// Update available permission
router.patch('/available-permissions/:id',
  protect,
  superAdminOnly(),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Remove immutable fields
      delete updates.permissionKey;
      delete updates._id;

      const permission = await AvailablePermission.findByIdAndUpdate(
        id,
        updates,
        { new: true, runValidators: true }
      );

      if (!permission) {
        return next(new AppError('Permission not found', 404));
      }

      res.status(200).json({
        status: 'success',
        message: 'Permission updated successfully',
        data: {
          permission
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== USER PERMISSION MANAGEMENT ====================

// Get all users with their permissions (for admin panel)
router.get('/users',
  protect,
  requirePermission('user_management', 'read'),
  async (req, res, next) => {
    try {
      const { department, status, stateCode } = req.query;
      
      const filter = {};
      if (department) filter.department = department;
      if (status) filter.status = status;

      // State-level filtering
      if (stateCode && stateCode !== 'NATIONAL') {
        filter['states.stateCode'] = stateCode;
      }

      const users = await VerifierRegistry.find(filter)
        .populate('userId', 'name email phone designation department isActive lastLoginAt')
        .populate({
          path: 'states.roles.permissions.permissionRef',
          model: 'AvailablePermission'
        })
        .sort({ createdAt: -1 });

      res.status(200).json({
        status: 'success',
        data: {
          users,
          total: users.length
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get specific user permissions
router.get('/users/:userId/permissions',
  protect,
  requirePermission('user_management', 'read'),
  async (req, res, next) => {
    try {
      const { userId } = req.params;

      const verifier = await VerifierRegistry.findOne({ userId })
        .populate('userId', 'name email phone designation department')
        .populate({
          path: 'states.roles.permissions.permissionRef',
          model: 'AvailablePermission'
        })
        .populate('states.roles.permissions.grantedBy', 'name email')
        .populate('states.roles.permissions.approvedBy', 'name email');

      if (!verifier) {
        return next(new AppError('User not found in registry', 404));
      }

      res.status(200).json({
        status: 'success',
        data: {
          user: verifier.userId,
          permissions: verifier.getAllPermissions(),
          jurisdictions: verifier.getJurisdictions(),
          states: verifier.states
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Add temporary permission to user
router.post('/users/:userId/permissions/temporary',
  protect,
  requirePermission('user_management', 'update'),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const {
        permissionId,
        stateCode,
        role,
        expiresAt,
        approvalRequired = false,
        conditions = {}
      } = req.body;

      if (!permissionId || !stateCode || !role || !expiresAt) {
        return next(new AppError('Permission ID, state code, role, and expiry date are required', 400));
      }

      // Validate expiry date
      const expiryDate = new Date(expiresAt);
      if (expiryDate <= new Date()) {
        return next(new AppError('Expiry date must be in the future', 400));
      }

      const verifier = await VerifierRegistry.findOne({ userId });
      if (!verifier) {
        return next(new AppError('User not found in registry', 404));
      }

      // Find the permission
      const permission = await AvailablePermission.findById(permissionId);
      if (!permission) {
        return next(new AppError('Permission not found', 404));
      }

      // Find state and role
      const state = verifier.states.find(s => s.stateCode === stateCode);
      if (!state) {
        return next(new AppError('State not found for user', 404));
      }

      const userRole = state.roles.find(r => r.role === role);
      if (!userRole) {
        return next(new AppError('Role not found for user in specified state', 404));
      }

      // Check if permission already exists
      const existingPermission = userRole.permissions.find(
        p => p.permissionRef.toString() === permissionId
      );

      if (existingPermission) {
        // Update existing permission with new expiry
        existingPermission.expiresAt = expiryDate;
        existingPermission.status = 'active';
        existingPermission.grantedBy = req.user.id;
        existingPermission.grantedAt = new Date();
        existingPermission.overrides.conditions = conditions;
      } else {
        // Add new temporary permission
        userRole.permissions.push({
          permissionRef: permissionId,
          permissionKey: permission.permissionKey,
          resource: permission.resource,
          action: permission.action,
          module: permission.module,
          expiresAt: expiryDate,
          grantedBy: req.user.id,
          grantedAt: new Date(),
          approvalRequired,
          status: approvalRequired ? 'pending' : 'active',
          overrides: {
            conditions,
            scope: permission.scope
          }
        });
      }

      await verifier.save();

      res.status(200).json({
        status: 'success',
        message: 'Temporary permission added successfully',
        data: {
          expiresAt: expiryDate,
          permission: permission
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Remove permission from user
router.delete('/users/:userId/permissions/:permissionId',
  protect,
  requirePermission('user_management', 'delete'),
  async (req, res, next) => {
    try {
      const { userId, permissionId } = req.params;
      const { stateCode, role } = req.body;

      if (!stateCode || !role) {
        return next(new AppError('State code and role are required', 400));
      }

      const verifier = await VerifierRegistry.findOne({ userId });
      if (!verifier) {
        return next(new AppError('User not found in registry', 404));
      }

      const state = verifier.states.find(s => s.stateCode === stateCode);
      if (!state) {
        return next(new AppError('State not found for user', 404));
      }

      const userRole = state.roles.find(r => r.role === role);
      if (!userRole) {
        return next(new AppError('Role not found for user', 404));
      }

      // Remove the permission
      userRole.permissions = userRole.permissions.filter(
        p => p.permissionRef.toString() !== permissionId
      );

      await verifier.save();

      res.status(200).json({
        status: 'success',
        message: 'Permission removed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== ROLE MANAGEMENT ====================

// Assign temporary role to user
router.post('/users/:userId/roles/temporary',
  protect,
  requirePermission('role_management', 'create'),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const {
        role,
        stateCode,
        expiresAt,
        permissions = [], // Array of permission IDs to auto-assign
        config = {}
      } = req.body;

      if (!role || !stateCode || !expiresAt) {
        return next(new AppError('Role, state code, and expiry date are required', 400));
      }

      const expiryDate = new Date(expiresAt);
      if (expiryDate <= new Date()) {
        return next(new AppError('Expiry date must be in the future', 400));
      }

      const verifier = await VerifierRegistry.findOne({ userId });
      if (!verifier) {
        return next(new AppError('User not found in registry', 404));
      }

      let state = verifier.states.find(s => s.stateCode === stateCode);
      if (!state) {
        // Create state if it doesn't exist
        state = {
          stateName: stateCode === 'NATIONAL' ? 'National' : `State ${stateCode}`,
          stateCode,
          region: stateCode === 'NATIONAL' ? 'national' : 'central',
          districts: [],
          roles: [],
          isActive: true
        };
        verifier.states.push(state);
      }

      // Check if role already exists
      const existingRole = state.roles.find(r => r.role === role);
      if (existingRole) {
        // Update existing role with new expiry
        existingRole.roleExpiresAt = expiryDate;
        existingRole.roleStatus = 'active';
        existingRole.isActive = true;
        existingRole.assignedAt = new Date();
        existingRole.createdBy = req.user.id;
      } else {
        // Create new temporary role
        const rolePermissions = [];
        
        // Add specified permissions
        if (permissions.length > 0) {
          const permissionDocs = await AvailablePermission.find({
            _id: { $in: permissions }
          });
          
          for (const perm of permissionDocs) {
            rolePermissions.push({
              permissionRef: perm._id,
              permissionKey: perm.permissionKey,
              resource: perm.resource,
              action: perm.action,
              module: perm.module,
              grantedBy: req.user.id,
              grantedAt: new Date(),
              status: 'active'
            });
          }
        }

        state.roles.push({
          role,
          description: `Temporary ${role} role`,
          level: getRoleLevel(role),
          category: getRoleCategory(role),
          permissions: rolePermissions,
          roleStatus: 'active',
          isActive: true,
          assignedAt: new Date(),
          roleExpiresAt: expiryDate,
          createdBy: req.user.id,
          config
        });
      }

      await verifier.save();

      res.status(200).json({
        status: 'success',
        message: 'Temporary role assigned successfully',
        data: {
          role,
          expiresAt: expiryDate,
          stateCode
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Remove role from user
router.delete('/users/:userId/roles/:role',
  protect,
  requirePermission('role_management', 'delete'),
  async (req, res, next) => {
    try {
      const { userId, role } = req.params;
      const { stateCode } = req.body;

      if (!stateCode) {
        return next(new AppError('State code is required', 400));
      }

      const verifier = await VerifierRegistry.findOne({ userId });
      if (!verifier) {
        return next(new AppError('User not found in registry', 404));
      }

      const state = verifier.states.find(s => s.stateCode === stateCode);
      if (!state) {
        return next(new AppError('State not found for user', 404));
      }

      // Remove the role
      state.roles = state.roles.filter(r => r.role !== role);

      await verifier.save();

      res.status(200).json({
        status: 'success',
        message: 'Role removed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== STATE & DISTRICT MANAGEMENT ====================

// Add state access to user
router.post('/users/:userId/states',
  protect,
  requirePermission('user_management', 'update'),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const {
        stateCode,
        stateName,
        region,
        districts = [],
        roles = []
      } = req.body;

      if (!stateCode || !stateName || !region) {
        return next(new AppError('State code, name, and region are required', 400));
      }

      const verifier = await VerifierRegistry.findOne({ userId });
      if (!verifier) {
        return next(new AppError('User not found in registry', 404));
      }

      // Check if state already exists
      const existingState = verifier.states.find(s => s.stateCode === stateCode);
      if (existingState) {
        return next(new AppError('User already has access to this state', 400));
      }

      // Add new state
      verifier.states.push({
        stateName,
        stateCode,
        region,
        districts: districts.map(district => ({
          districtName: district.districtName,
          districtCode: district.districtCode,
          category: district.category || 'moderate_mining',
          isActive: true,
          activatedAt: new Date()
        })),
        roles: roles.map(role => ({
          role: role.role,
          description: role.description,
          level: role.level,
          category: role.category,
          permissions: [],
          roleStatus: 'active',
          isActive: true,
          assignedAt: new Date(),
          createdBy: req.user.id
        })),
        isActive: true,
        activatedBy: req.user.id
      });

      await verifier.save();

      res.status(200).json({
        status: 'success',
        message: 'State access added successfully',
        data: {
          stateCode,
          stateName
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== APPROVAL WORKFLOW ====================

// Approve pending permissions
router.post('/permissions/approve',
  protect,
  requirePermission('user_management', 'approve'),
  async (req, res, next) => {
    try {
      const { userId, permissionId, stateCode, role } = req.body;

      if (!userId || !permissionId || !stateCode || !role) {
        return next(new AppError('All fields are required', 400));
      }

      const verifier = await VerifierRegistry.findOne({ userId });
      if (!verifier) {
        return next(new AppError('User not found in registry', 404));
      }

      const state = verifier.states.find(s => s.stateCode === stateCode);
      if (!state) {
        return next(new AppError('State not found', 404));
      }

      const userRole = state.roles.find(r => r.role === role);
      if (!userRole) {
        return next(new AppError('Role not found', 404));
      }

      const permission = userRole.permissions.find(
        p => p.permissionRef.toString() === permissionId && p.status === 'pending'
      );

      if (!permission) {
        return next(new AppError('Pending permission not found', 404));
      }

      permission.status = 'active';
      permission.approvedBy = req.user.id;
      permission.approvedAt = new Date();

      await verifier.save();

      res.status(200).json({
        status: 'success',
        message: 'Permission approved successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== EXPIRY MANAGEMENT ====================

// Get expiring permissions and roles (for notifications)
router.get('/expiring-items',
  protect,
  requirePermission('user_management', 'read'),
  async (req, res, next) => {
    try {
      const { days = 7 } = req.query;
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() + parseInt(days));

      // Find expiring permissions
      const expiringPermissions = await VerifierRegistry.aggregate([
        { $unwind: '$states' },
        { $unwind: '$states.roles' },
        { $unwind: '$states.roles.permissions' },
        {
          $match: {
            'states.roles.permissions.expiresAt': {
              $lte: thresholdDate,
              $gte: new Date()
            },
            'states.roles.permissions.status': 'active'
          }
        },
        {
          $project: {
            userId: 1,
            name: 1,
            email: 1,
            stateCode: '$states.stateCode',
            role: '$states.roles.role',
            permission: '$states.roles.permissions',
            expiresAt: '$states.roles.permissions.expiresAt'
          }
        }
      ]);

      // Find expiring roles
      const expiringRoles = await VerifierRegistry.aggregate([
        { $unwind: '$states' },
        { $unwind: '$states.roles' },
        {
          $match: {
            'states.roles.roleExpiresAt': {
              $lte: thresholdDate,
              $gte: new Date()
            },
            'states.roles.roleStatus': 'active'
          }
        },
        {
          $project: {
            userId: 1,
            name: 1,
            email: 1,
            stateCode: '$states.stateCode',
            role: '$states.roles.role',
            expiresAt: '$states.roles.roleExpiresAt'
          }
        }
      ]);

      res.status(200).json({
        status: 'success',
        data: {
          expiringPermissions,
          expiringRoles,
          thresholdDate
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== UTILITY FUNCTIONS ====================

// Helper function to get role level
function getRoleLevel(role) {
  const roleLevels = {
    'geo_analyst': 1,
    'senior_geo_officer': 2,
    'ai_model_custodian': 3,
    'district_mining_officer': 4,
    'state_mining_admin': 5,
    'intelligence_analyst': 6,
    'ntro_nodal_officer': 6,
    'system_super_admin': 7,
    'public_user': 1,
    'auditor': 3,
    'research_analyst': 2
  };
  return roleLevels[role] || 1;
}

// Helper function to get role category
function getRoleCategory(role) {
  if (role.includes('geo') || role.includes('ai')) return 'technical';
  if (role.includes('mining') || role.includes('admin')) return 'administrative';
  if (role.includes('intelligence') || role.includes('ntro')) return 'intelligence';
  if (role.includes('super_admin')) return 'system';
  return 'public';
}

export default router;