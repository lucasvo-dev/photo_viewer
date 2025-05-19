export const IMAGES_PER_PAGE = 24;
export const INITIAL_LOAD_LIMIT = 5; // How many images to load super fast
export const STANDARD_LOAD_LIMIT = 50; // How many images per page (including subsequent 'load more')
export const ACTIVE_ZIP_JOB_KEY = 'activeZipJob';
export const API_BASE_URL = 'api.php'; // Thêm một hằng số cho API base URL 

/**
 * Fetches data from the API.
 * @param {string} action - The API action to call.
 * @param {object} params - An object of query parameters to append to the URL.
 * @param {object} options - Optional fetch options (e.g., method, headers, body for POST).
 * @returns {Promise<object>} - A promise that resolves to the JSON response from the API.
 */
export async function fetchDataApi(action, params = {}, options = {}) {
    const url = new URL(API_BASE_URL, window.location.origin);
    url.searchParams.append('action', action);
    for (const key in params) {
        if (params.hasOwnProperty(key)) {
            url.searchParams.append(key, params[key]);
        }
    }

    const defaultOptions = {
        method: 'GET', // Default to GET
        headers: {
            'Content-Type': 'application/json',
            // Add any other default headers, like CSRF tokens if used
        },
    };

    const fetchOptions = { ...defaultOptions, ...options };

    if (fetchOptions.method === 'POST' && options.body) {
        if (typeof options.body === 'object' && !(options.body instanceof FormData)) {
            fetchOptions.body = JSON.stringify(options.body);
        } // If it's FormData or already a string, use as is
    } else if (fetchOptions.method === 'POST' && !options.body) {
        // For POST ensure headers are set for x-www-form-urlencoded if no body provided
        // but we are sending params via URL for POST in some cases (like check_auth with password)
        // For simplicity, if body is not FormData, and params are present, convert to FormData for POST
        // However, the current setup mostly uses GET or FormData POSTs, so this might not be strictly needed
        // For now, let's stick to JSON or FormData if body is provided.
        // If it is a POST and there are params but no body, and Content-Type is not application/x-www-form-urlencoded
        // it might be better to construct a FormData from params if that's the server expectation.
        // But the common pattern is GET with URL params, or POST with FormData/JSON body.
    }

    try {
        const response = await fetch(url.toString(), fetchOptions);
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { message: response.statusText };
            }
            // Enhance error object with status and API error message
            const error = new Error(errorData.message || `API request failed with status ${response.status}`);
            error.status = response.status;
            error.data = errorData;
            throw error;
        }
        return await response.json();
    } catch (error) {
        console.error(`[fetchDataApi] Error calling action "${action}":`, error);
        // Re-throw the error so the calling function can handle it if needed
        // Or return a structured error object: return { status: 'error', message: error.message, details: error };
        throw error; 
    }
} 