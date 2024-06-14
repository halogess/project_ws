const router = require("express").Router();
const {
  login,
  register,
  viewUserProfile,
  editUserProfileData,
  editUserProfilePicture,
} = require("../controllers/UserController.js");

const {
  getCompanies,
  getCompaniesByUsername,
  getTopUpRequest,
  editTopUpRequest,
} = require("../controllers/AdminController.js");

const {
  upgradeCompanyPlanType,
  generateCompanyInvitationCode,
} = require("../controllers/CompanyController.js");

const {
  validateAccessToken,
  allowRoles,
} = require("../middleware/AuthMiddleware.js");
const uploadSingle = require("../middleware/MulterMiddleware.js");

const {
  join,
  joinCompany,
  getEmployeeCompany,
} = require("../controllers/EmployeeController.js");

// General
router.post("/login", login);
router.post("/register", register);
router.get(
  "/profile",
  validateAccessToken,
  allowRoles(["employee", "company"]),
  viewUserProfile
);
router.put(
  "/profile/data",
  validateAccessToken,
  allowRoles(["employee", "company"]),
  editUserProfileData
);
router.put(
  "/profile/picture",
  validateAccessToken,
  allowRoles(["employee", "company"]),
  editUserProfilePicture
);

// Admin

router.get(
  "/companies",
  validateAccessToken,
  allowRoles(["admin"]),
  getCompanies
);
router.get(
  "/companies/:username",
  validateAccessToken,
  allowRoles(["admin"]),
  getCompaniesByUsername
);
router.get(
  "/topup",
  validateAccessToken,
  allowRoles(["admin"]),
  getTopUpRequest
);
router.put(
  "/topup/:topup_id",
  validateAccessToken,
  allowRoles(["admin"]),
  editTopUpRequest
);

// Company

router.post(
  "/upgrade",
  validateAccessToken,
  allowRoles(["company"]),
  upgradeCompanyPlanType
);
router.post(
  "/invitation_code",
  validateAccessToken,
  allowRoles(["company"]),
  generateCompanyInvitationCode
);

// employee
router.post(
  "/company",
  validateAccessToken,
  allowRoles(["employee"]),
  joinCompany
);

router.get(
  "/company",
  validateAccessToken,
  allowRoles(["employee"]),
  getEmployeeCompany
);

module.exports = router;
