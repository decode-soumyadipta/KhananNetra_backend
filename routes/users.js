import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import VerifierRegistry from '../models/VerifierRegistry.js';
import { protect, restrictTo } from '../middleware/auth.js';
import AppError from '../utils/appError.js';

const router = express.Router();

// All routes protected after this
router.use(protect);

// ==================== VALIDATION MIDDLEWARE ====================
const createUserValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required'),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  
  body('designation')
    .trim()
    .notEmpty().withMessage('Designation is required'),
  
  body('department')
    .trim()
    .notEmpty().withMessage('Department is required'),
  
  body('states')
    .optional()
    .isArray().withMessage('States must be an array')
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ Validation errors:', errors.array());
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// GET USER PROFILE
router.get('/profile', (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
});

// GET ALL USERS (Admin only)
router.get('/', restrictTo('system_super_admin', 'state_admin'), async (req, res, next) => {
  try {
    const users = await User.find().select('-password');
    
    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users
      }
    });
  } catch (error) {
    next(error);
  }
});

// CREATE NEW USER (Admin only)
router.post('/', 
  restrictTo('system_super_admin', 'state_admin'),
  createUserValidation,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      console.log('📥 Received create user request');
      console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
      
      const { 
        name, 
        email, 
        phone, 
        password, 
        designation, 
        department, 
        states,
        userType,
        stateAccess,
        districtAccess
      } = req.body;

      console.log('📝 Creating new user:', { name, email, designation, department, userType });

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        console.log('❌ User already exists:', email);
        return res.status(400).json({
          status: 'fail',
          message: 'User already exists with this email'
        });
      }

      // Check if phone already exists
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        console.log('❌ Phone number already registered:', phone);
        return res.status(400).json({
          status: 'fail',
          message: 'Phone number is already registered'
        });
      }

      // Build states array from request
      let statesData = states;
      
      // If states not provided, build from userType and stateAccess
      if (!statesData || !Array.isArray(statesData) || statesData.length === 0) {
        if (userType && stateAccess) {
          // Get role templates for this user type
          const roleMapping = {
            'GEO_ANALYST': 'geo_analyst',
            'SENIOR_GEO_OFFICER': 'senior_geo_officer',
            'AI_MODEL_CUSTODIAN': 'ai_model_custodian',
            'DISTRICT_MINING_OFFICER': 'district_mining_officer',
            'STATE_MINING_ADMIN': 'state_mining_admin',
            'NTRO_NODAL_OFFICER': 'ntro_nodal_officer',
            'INTELLIGENCE_ANALYST': 'intelligence_analyst',
            'ADMIN': 'system_super_admin'
          };
          
          const role = roleMapping[userType] || 'geo_analyst';
          
          // Default permissions based on role
          const defaultPermissions = {
            geo_analyst: [
              { resource: 'satellite_imagery', action: 'read' },
              { resource: 'mining_analysis', action: 'create' },
              { resource: 'mining_analysis', action: 'read' }
            ],
            senior_geo_officer: [
              { resource: 'satellite_imagery', action: 'read' },
              { resource: 'mining_analysis', action: 'read' },
              { resource: 'reports_approval', action: 'approve' }
            ],
            system_super_admin: [
              { resource: 'user_management', action: 'manage' },
              { resource: 'system_config', action: 'manage' }
            ]
          };
          
          statesData = [{
            stateName: stateAccess || 'West Bengal',
            stateCode: stateAccess === 'West Bengal' ? 'WB' : 'NA',
            districts: districtAccess ? [districtAccess] : [],
            roles: [{
              role: role,
              description: `${userType} role for ${stateAccess}`,
              permissions: defaultPermissions[role] || []
            }]
          }];
        } else {
          return res.status(400).json({
            status: 'fail',
            message: 'Either states array or userType with stateAccess is required'
          });
        }
      }

      console.log('✅ All validations passed. Creating user...');
      console.log('📍 States data:', JSON.stringify(statesData, null, 2));

      // Create new user with auto-verification for admin-created users
      const newUser = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        password, // Will be hashed by pre-save middleware
        designation: designation.trim(),
        department: department.trim(),
        isVerified: true, // Admin-created users are auto-verified
        isActive: true
      });

      console.log('✅ User created in User collection:', newUser._id);

      // Map role to category and level
      const roleCategoryMap = {
        'geo_analyst': { category: 'technical', level: 3 },
        'senior_geo_officer': { category: 'technical', level: 4 },
        'ai_model_custodian': { category: 'technical', level: 5 },
        'district_mining_officer': { category: 'administrative', level: 3 },
        'state_mining_admin': { category: 'administrative', level: 4 },
        'ntro_nodal_officer': { category: 'intelligence', level: 5 },
        'intelligence_analyst': { category: 'intelligence', level: 4 },
        'system_super_admin': { category: 'system', level: 7 },
        'public_user': { category: 'public', level: 1 }
      };

      // Prepare verifier registry data with states from request
      const verifierData = {
        userId: newUser._id,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        designation: designation.trim(),
        department: department.trim(), // Add department to verifierData
        // Admin-created users are auto-approved
        status: 'active',
        approvedBy: req.user.id,
        approvedAt: new Date(),
        // Set appropriate access tier and verification level
        accessTier: department === 'NTRO' ? 'ntro_privileged' : 'government',
        globalVerificationLevel: 3,
        states: statesData.map(state => ({
          stateName: state.stateName.trim(),
          stateCode: state.stateCode ? state.stateCode.trim().toUpperCase() : 'NA',
          region: state.region || 'national', // Add region with default
          districts: (state.districts || []).map(district => ({
            districtName: district.districtName || 'All Districts',
            districtCode: district.districtCode || 'ALL',
            category: district.category || 'moderate_mining'
          })),
          stateConfig: state.stateConfig || {},
          roles: state.roles.map(role => {
            const roleConfig = roleCategoryMap[role.role] || { category: 'technical', level: 3 };
            return {
              role: role.role,
              description: role.description || `${role.role} role for ${state.stateName}`,
              category: roleConfig.category, // Add category
              level: roleConfig.level, // Add level
              permissions: [], // Empty array - permissions handled via role-based access control
              roleStatus: 'active', // Active immediately
              isActive: true,
              assignedAt: new Date(),
              createdBy: req.user.id,
              roleExpiresAt: role.roleExpiresAt || null
            };
          }),
          isActive: true, // State is active
          activatedBy: req.user.id
        }))
      };

      // Create verifier registry entry
      const verifierRegistry = await VerifierRegistry.create(verifierData);
      console.log('✅ Verifier registry created:', verifierRegistry._id);

      // Log the user creation
      console.log(`✅ User created successfully by ${req.user.name} (${req.user.email})`);
      console.log(`   New User: ${newUser.name} (${newUser.email})`);
      console.log(`   States: ${statesData.map(s => s.stateName).join(', ')}`);
      console.log(`   Roles: ${statesData.flatMap(s => s.roles.map(r => r.role)).join(', ')}`);

      res.status(201).json({
        status: 'success',
        message: 'User created successfully',
        data: {
          user: {
            id: newUser._id,
            name: newUser.name,
            email: newUser.email,
            phone: newUser.phone,
            designation: newUser.designation,
            department: newUser.department,
            isVerified: newUser.isVerified,
            isActive: newUser.isActive,
            createdAt: newUser.createdAt,
            states: statesData.map(s => ({
              stateName: s.stateName,
              stateCode: s.stateCode,
              roles: s.roles.map(r => r.role)
            }))
          }
        }
      });
    } catch (error) {
      console.error('❌ Error creating user:', error);
      console.error('❌ Error stack:', error.stack);
      
      // If verifier was created but user creation failed, clean up
      if (error.name === 'MongoError' && error.code === 11000) {
        return res.status(400).json({
          status: 'fail',
          message: 'A user with this email or phone already exists'
        });
      }
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to create user',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
  }
);

// UPDATE USER PERMISSIONS (Admin only)
router.patch('/:id/permissions', restrictTo('system_super_admin', 'state_admin'), async (req, res, next) => {
  try {
    const { states } = req.body;
    
    const verifier = await VerifierRegistry.findOne({ userId: req.params.id });
    
    if (!verifier) {
      return next(new AppError('User not found in verifier registry', 404));
    }

    // Validate states structure
    if (!states || !Array.isArray(states)) {
      return next(new AppError('States array is required', 400));
    }

    // Update states with new permissions
    verifier.states = states.map(state => ({
      stateName: state.stateName,
      stateCode: state.stateCode,
      districts: state.districts || [],
      stateConfig: state.stateConfig || {},
      roles: state.roles.map(role => ({
        role: role.role,
        description: role.description || `${role.role} role for ${state.stateName}`,
        permissions: role.permissions.map(perm => ({
          resource: perm.resource,
          action: perm.action,
          grantedAt: new Date(),
          expiresAt: perm.expiresAt,
          status: perm.status || 'active',
          grantedBy: req.user.id,
          conditions: perm.conditions || {}
        })),
        roleStatus: role.roleStatus || 'active',
        isActive: role.isActive !== undefined ? role.isActive : true,
        assignedAt: new Date(),
        assignedBy: req.user.id,
        roleExpiresAt: role.roleExpiresAt
      }))
    }));

    await verifier.save();

    res.status(200).json({
      status: 'success',
      message: 'User permissions updated successfully',
      data: {
        verifier: {
          states: verifier.states
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ADD NEW STATE TO USER (Admin only)
router.post('/:id/states', restrictTo('super_admin', 'state_admin'), async (req, res, next) => {
  try {
    const { state } = req.body;
    
    const verifier = await VerifierRegistry.findOne({ userId: req.params.id });
    
    if (!verifier) {
      return next(new AppError('User not found in verifier registry', 404));
    }

    // Validate state structure
    if (!state || !state.stateCode || !state.roles) {
      return next(new AppError('Valid state with roles is required', 400));
    }

    // Check if state already exists
    const existingState = verifier.states.find(s => s.stateCode === state.stateCode);
    if (existingState) {
      return next(new AppError('State already exists for this user', 400));
    }

    // Add new state
    verifier.states.push({
      stateName: state.stateName,
      stateCode: state.stateCode,
      districts: state.districts || [],
      stateConfig: state.stateConfig || {},
      roles: state.roles.map(role => ({
        role: role.role,
        description: role.description || `${role.role} role for ${state.stateName}`,
        permissions: role.permissions.map(perm => ({
          resource: perm.resource,
          action: perm.action,
          grantedAt: new Date(),
          expiresAt: perm.expiresAt,
          status: perm.status || 'active',
          grantedBy: req.user.id,
          conditions: perm.conditions || {}
        })),
        roleStatus: role.roleStatus || 'active',
        isActive: role.isActive !== undefined ? role.isActive : true,
        assignedAt: new Date(),
        assignedBy: req.user.id,
        roleExpiresAt: role.roleExpiresAt
      }))
    });

    await verifier.save();

    res.status(200).json({
      status: 'success',
      message: 'State added to user successfully',
      data: {
        state: verifier.states.find(s => s.stateCode === state.stateCode)
      }
    });
  } catch (error) {
    next(error);
  }
});

// REMOVE STATE FROM USER (Admin only)
router.delete('/:id/states/:stateCode', restrictTo('system_super_admin', 'state_admin'), async (req, res, next) => {
  try {
    const { stateCode } = req.params;
    
    const verifier = await VerifierRegistry.findOne({ userId: req.params.id });
    
    if (!verifier) {
      return next(new AppError('User not found in verifier registry', 404));
    }

    // Remove state
    verifier.states = verifier.states.filter(state => state.stateCode !== stateCode);
    
    await verifier.save();

    res.status(200).json({
      status: 'success',
      message: 'State removed from user successfully'
    });
  } catch (error) {
    next(error);
  }
});

// GET AVAILABLE PERMISSIONS OPTIONS (For frontend dropdowns)
router.get('/permissions/options', restrictTo('super_admin', 'state_admin'), (req, res) => {
  const permissionOptions = {
    resources: [
      'user_management',
      'mining_analysis', 
      'compliance_reports',
      'satellite_imagery',
      'volumetric_calculations',
      '3d_visualization',
      'system_analytics',
      'audit_logs',
      'public_portal',
      'mining_leases',
      'reports_approval',
      'data_export',
      'system_config'
    ],
    actions: [
      'create',
      'read', 
      'update',
      'delete',
      'approve',
      'reject',
      'export',
      'manage'
    ],
    statusOptions: [
      'active',
      'inactive',
      'paused',
      'revoked',
      'pending',
      'expired'
    ]
  };

  res.status(200).json({
    status: 'success',
    data: permissionOptions
  });
});

// GET AVAILABLE ROLES WITH DEFAULT PERMISSIONS (For frontend)
router.get('/roles/templates', restrictTo('super_admin', 'state_admin'), (req, res) => {
  const roleTemplates = {
    geo_analyst: {
      role: 'geo_analyst',
      displayName: 'Geo Analyst',
      description: 'Geospatial Analyst for mining analysis',
      level: 3,
      category: 'technical',
      defaultPermissions: [
        { resource: 'satellite_imagery', action: 'read' },
        { resource: 'mining_analysis', action: 'create' },
        { resource: 'mining_analysis', action: 'read' },
        { resource: 'volumetric_calculations', action: 'create' },
        { resource: 'volumetric_calculations', action: 'read' },
        { resource: '3d_visualization', action: 'read' },
        { resource: 'compliance_reports', action: 'read' }
      ]
    },
    senior_geo_officer: {
      role: 'senior_geo_officer',
      displayName: 'Senior Geo Officer',
      description: 'Senior Geospatial Officer with approval rights',
      level: 4,
      category: 'technical',
      defaultPermissions: [
        { resource: 'satellite_imagery', action: 'read' },
        { resource: 'satellite_imagery', action: 'manage' },
        { resource: 'mining_analysis', action: 'create' },
        { resource: 'mining_analysis', action: 'read' },
        { resource: 'mining_analysis', action: 'update' },
        { resource: 'reports_approval', action: 'approve' },
        { resource: 'reports_approval', action: 'reject' },
        { resource: 'volumetric_calculations', action: 'create' },
        { resource: 'volumetric_calculations', action: 'read' },
        { resource: 'compliance_reports', action: 'read' },
        { resource: 'data_export', action: 'export' }
      ]
    },
    district_mining_officer: {
      role: 'district_mining_officer',
      displayName: 'District Mining Officer',
      description: 'District-level mining operations officer',
      level: 3,
      category: 'administrative',
      defaultPermissions: [
        { resource: 'mining_leases', action: 'read' },
        { resource: 'mining_leases', action: 'update' },
        { resource: 'compliance_reports', action: 'read' },
        { resource: 'mining_analysis', action: 'read' },
        { resource: 'audit_logs', action: 'read' }
      ]
    },
    state_mining_admin: {
      role: 'state_mining_admin',
      displayName: 'State Mining Admin',
      description: 'State-level mining administration',
      level: 5,
      category: 'administrative',
      defaultPermissions: [
        { resource: 'mining_leases', action: 'read' },
        { resource: 'mining_leases', action: 'create' },
        { resource: 'mining_leases', action: 'update' },
        { resource: 'mining_leases', action: 'delete' },
        { resource: 'compliance_reports', action: 'read' },
        { resource: 'compliance_reports', action: 'create' },
        { resource: 'mining_analysis', action: 'read' },
        { resource: 'reports_approval', action: 'approve' },
        { resource: 'reports_approval', action: 'reject' },
        { resource: 'user_management', action: 'read' },
        { resource: 'audit_logs', action: 'read' },
        { resource: 'data_export', action: 'export' }
      ]
    },
    ntro_nodal_officer: {
      role: 'ntro_nodal_officer',
      displayName: 'NTRO Nodal Officer',
      description: 'NTRO coordination and oversight officer',
      level: 6,
      category: 'intelligence',
      defaultPermissions: [
        { resource: 'satellite_imagery', action: 'read' },
        { resource: 'satellite_imagery', action: 'manage' },
        { resource: 'mining_analysis', action: 'read' },
        { resource: 'compliance_reports', action: 'read' },
        { resource: 'system_analytics', action: 'read' },
        { resource: 'audit_logs', action: 'read' },
        { resource: 'data_export', action: 'export' },
        { resource: 'user_management', action: 'read' }
      ]
    },
    intelligence_analyst: {
      role: 'intelligence_analyst',
      displayName: 'Intelligence Analyst',
      description: 'Intelligence analysis and monitoring',
      level: 4,
      category: 'intelligence',
      defaultPermissions: [
        { resource: 'mining_analysis', action: 'read' },
        { resource: 'compliance_reports', action: 'read' },
        { resource: 'system_analytics', action: 'read' },
        { resource: 'audit_logs', action: 'read' },
        { resource: 'data_export', action: 'export' }
      ]
    },
    ai_model_custodian: {
      role: 'ai_model_custodian',
      displayName: 'AI Model Custodian',
      description: 'AI/ML model management and configuration',
      level: 5,
      category: 'technical',
      defaultPermissions: [
        { resource: 'satellite_imagery', action: 'read' },
        { resource: 'satellite_imagery', action: 'manage' },
        { resource: 'mining_analysis', action: 'read' },
        { resource: 'mining_analysis', action: 'create' },
        { resource: 'system_config', action: 'read' },
        { resource: 'system_config', action: 'update' },
        { resource: 'system_analytics', action: 'read' },
        { resource: 'audit_logs', action: 'read' }
      ]
    },
    system_super_admin: {
      role: 'system_super_admin',
      displayName: 'System Super Admin',
      description: 'Full system administration access',
      level: 7,
      category: 'system',
      defaultPermissions: [
        { resource: 'user_management', action: 'create' },
        { resource: 'user_management', action: 'read' },
        { resource: 'user_management', action: 'update' },
        { resource: 'user_management', action: 'delete' },
        { resource: 'user_management', action: 'manage' },
        { resource: 'mining_analysis', action: 'read' },
        { resource: 'mining_analysis', action: 'manage' },
        { resource: 'compliance_reports', action: 'read' },
        { resource: 'compliance_reports', action: 'manage' },
        { resource: 'satellite_imagery', action: 'read' },
        { resource: 'satellite_imagery', action: 'manage' },
        { resource: 'system_config', action: 'read' },
        { resource: 'system_config', action: 'update' },
        { resource: 'system_config', action: 'manage' },
        { resource: 'system_analytics', action: 'read' },
        { resource: 'audit_logs', action: 'read' },
        { resource: 'data_export', action: 'export' },
        { resource: 'reports_approval', action: 'approve' },
        { resource: 'reports_approval', action: 'reject' }
      ]
    },
    public_user: {
      role: 'public_user',
      displayName: 'Public User',
      description: 'Public portal access',
      level: 1,
      category: 'public',
      defaultPermissions: [
        { resource: 'public_portal', action: 'read' }
      ]
    },
    auditor: {
      role: 'auditor',
      displayName: 'Auditor',
      description: 'System audit and compliance review',
      level: 5,
      category: 'administrative',
      defaultPermissions: [
        { resource: 'audit_logs', action: 'read' },
        { resource: 'audit_logs', action: 'export' },
        { resource: 'compliance_reports', action: 'read' },
        { resource: 'user_management', action: 'read' },
        { resource: 'system_analytics', action: 'read' },
        { resource: 'data_export', action: 'export' }
      ]
    }
  };

  res.status(200).json({
    status: 'success',
    data: {
      roles: Object.values(roleTemplates)
    }
  });
});

export default router;