/**
 * Supplier Portal Module
 * 
 * Secure supplier interface for managing presence in GloveCubs marketplace.
 */

// Authentication
export {
  loginSupplier,
  validateSession,
  logoutSupplier,
  logoutAllSessions,
  createSupplierUser,
  updateSupplierPassword,
  logAuditEvent,
  getAuditLog,
  cleanupExpiredSessions,
  type SupplierUser,
  type SupplierSession,
  type AuthResult,
} from './auth';

// Dashboard
export {
  getDashboardSummary,
  getOfferHealth,
  getCompetitivenessInsights,
  getRankDistribution,
  getFeedHealthMetrics,
  getRejectedRecommendationStats,
  type DashboardSummary,
  type OfferHealth,
  type CompetitivenessInsight,
  type FeedHealthMetrics,
} from './dashboard';

// Offers
export {
  listOffers,
  getOffer,
  createOffer,
  updateOffer,
  bulkUpdatePrices,
  deactivateOffer,
  reactivateOffer,
  bulkUploadOffers,
  searchProducts,
  type SupplierOffer,
  type CreateOfferInput,
  type UpdateOfferInput,
  type BulkUploadResult,
  type BulkUploadRow,
} from './offers';

// Alerts
export {
  listAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  dismissAlert,
  createAlert,
  generateSupplierAlerts,
  getAlertCounts,
  type AlertType,
  type AlertSeverity,
  type SupplierAlert,
} from './alerts';

// Feed Upload
export {
  createFeedUpload,
  parseCSV,
  parseXLSX,
  parseFileContent,
  detectFileType,
  validateFile,
  normalizeHeader,
  extractFields,
  normalizeAndMatch,
  validateRow,
  processFeedUpload,
  correctRow,
  commitFeedUpload,
  getUploadRows,
  getUploadStatus,
  type UploadStatus,
  type FeedUpload,
  type ParsedRow,
  type ExtractedProduct,
  type NormalizedProduct,
  type ValidationResult,
  type ValidationWarning,
  type ValidationError,
  type FeedUploadResult,
  type FileValidationResult,
} from './feedUpload';

// Dashboard Intelligence
export {
  getUploadHistory,
  getFeedUploadMetrics,
  getExtractionConfidenceDistribution,
  getValidationWarningCounts,
  getCorrectionMetrics,
  getLostOpportunities,
  getNearWinOpportunities,
  getActionItems,
  getCompetitivenessMetrics,
  type UploadHistoryItem,
  type FeedUploadMetrics,
  type ExtractionConfidenceDistribution,
  type ValidationWarningCounts,
  type CorrectionMetrics,
  type LostOpportunity,
  type NearWinOpportunity,
  type ActionItem,
  type CompetitivenessMetrics,
} from './dashboardIntelligence';
