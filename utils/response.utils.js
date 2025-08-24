/**
 * Standard success response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Success message
 * @param {Object} data - Response data
 * @returns {Object} - Express response
 */
const successResponse = (res, statusCode = 200, message = 'Success', data = {}) => {
    return res.status(statusCode).json({
        status: 'success',
        message,
        data
    });
};

/**
 * Standard error response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Object} errors - Error details
 * @returns {Object} - Express response
 */
const errorResponse = (res, statusCode = 500, message = 'Error', errors = null) => {
    const response = {
        status: 'error',
        message
    };

    if (errors) {
        response.errors = errors;
    }

    return res.status(statusCode).json(response);
};

module.exports = {
    successResponse,
    errorResponse
};