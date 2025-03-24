// script.js (Updated for better error handling and compatibility)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const hfTokenInput = document.getElementById('hf-token');
    const validateTokenBtn = document.getElementById('validate-token-btn');
    const tokenAlert = document.getElementById('token-alert');
    const modelPopup = document.getElementById('model-popup');
    const popupModelSearch = document.getElementById('popup-model-search');
    const popupModelCategory = document.getElementById('popup-model-category');
    const popupModelList = document.getElementById('popup-model-list');
    const popupModelLoading = document.getElementById('popup-model-loading');
    const popupModelAlert = document.getElementById('popup-model-alert');
    const closeButton = document.querySelector('.close-button');
    const interactionSection = document.getElementById('interaction-section');
    const selectedModelNameDisplay = document.getElementById('selected-model-name');
    const promptInput = document.getElementById('prompt-input');
    const queryModelBtn = document.getElementById('query-model-btn');
    const responseArea = document.getElementById('response-area');
    const aiResponseDisplay = document.getElementById('ai-response');
    const copyResponseBtn = document.getElementById('copy-response-btn');
    const clearResponseBtn = document.getElementById('clear-response-btn');
    const interactionLoading = document.getElementById('interaction-loading');
    const interactionAlert = document.getElementById('interaction-alert');
    const interactionHistory = document.getElementById('interaction-history');

    // --- Check for Missing DOM Elements ---
    const requiredElements = [
        { element: hfTokenInput, id: 'hf-token' },
        { element: validateTokenBtn, id: 'validate-token-btn' },
        { element: tokenAlert, id: 'token-alert' },
        { element: modelPopup, id: 'model-popup' },
        { element: popupModelSearch, id: 'popup-model-search' },
        { element: popupModelCategory, id: 'popup-model-category' },
        { element: popupModelList, id: 'popup-model-list' },
        { element: popupModelLoading, id: 'popup-model-loading' },
        { element: popupModelAlert, id: 'popup-model-alert' },
        { element: closeButton, class: 'close-button' },
        { element: interactionSection, id: 'interaction-section' },
        { element: selectedModelNameDisplay, id: 'selected-model-name' },
        { element: promptInput, id: 'prompt-input' },
        { element: queryModelBtn, id: 'query-model-btn' },
        { element: responseArea, id: 'response-area' },
        { element: aiResponseDisplay, id: 'ai-response' },
        { element: copyResponseBtn, id: 'copy-response-btn' },
        { element: clearResponseBtn, id: 'clear-response-btn' },
        { element: interactionLoading, id: 'interaction-loading' },
        { element: interactionAlert, id: 'interaction-alert' },
        { element: interactionHistory, id: 'interaction-history' }
    ];

    const missingElements = requiredElements.filter(item => !item.element);
    if (missingElements.length > 0) {
        const missingIds = missingElements.map(item => item.id || item.class).join(', ');
        console.error(`Missing DOM elements: ${missingIds}`);
        alert(`Error: Missing required DOM elements (${missingIds}). Please check your HTML structure.`);
        return;
    }

    const HF_API_BASE_URL = 'https://api.huggingface.co';
    const HF_INFERENCE_API_BASE_URL = 'https://api-inference.huggingface.co/models';

    let hfToken = null;
    let availableModels = [];
    let selectedModelId = null;
    let history = [];

    // Supported pipeline tags for the Inference API
    const SUPPORTED_PIPELINE_TAGS = [
        'text-generation',
        'text-classification',
        'question-answering',
        'fill-mask',
        'token-classification',
        'summarization',
        'translation',
        'conversational'
    ];

    // --- Utility Functions ---
    function showAlert(element, message, type = 'error', duration = 5000) {
        if (!element) return;
        element.textContent = message;
        element.className = `alert ${type} show`;
        setTimeout(() => {
            element.classList.remove('show');
        }, duration);
    }

    function setLoading(element, isLoading) {
        if (!element) return;
        element.style.display = isLoading ? 'block' : 'none';
    }

    function clearAlert(element) {
        if (!element) return;
        element.classList.remove('success', 'error', 'show');
        element.textContent = '';
    }

    // --- Retry Fetch with Exponential Backoff ---
    async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please wait a moment and try again.');
                }
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`Request failed: ${errorData.error || response.statusText}`);
                }
                return response;
            } catch (error) {
                if (i === retries - 1) {
                    let errorMessage = `Failed to fetch ${url}: ${error.message}`;
                    if (error.message.includes('ERR_NAME_NOT_RESOLVED')) {
                        errorMessage = 'Cannot reach Hugging Face API: DNS resolution failed. This is likely due to your network configuration. Please try the following:\n' +
                                       '1. Switch to Google DNS (8.8.8.8 and 8.8.4.4) or Cloudflare DNS (1.1.1.1 and 1.0.0.1).\n' +
                                       '2. Flush your DNS cache (Windows: ipconfig /flushdns, macOS: sudo dscacheutil -flushcache).\n' +
                                       '3. Use a VPN to bypass network restrictions.\n' +
                                       '4. Test on a different network (e.g., mobile hotspot).\n' +
                                       '5. Check for firewall or antivirus software blocking the domain.\n' +
                                       'See the README for detailed troubleshooting steps.';
                    } else if (error.message.includes('Failed to fetch')) {
                        errorMessage = 'Network error: Unable to connect to the Hugging Face API. Ensure you have a stable internet connection and are not behind a restrictive firewall or proxy.';
                    }
                    throw new Error(errorMessage);
                }
                console.warn(`Fetch failed for ${url}, retrying (${i + 1}/${retries})...`, error);
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            }
        }
    }

    // --- Check if a Model is Available for Inference ---
    async function isModelAvailable(modelId) {
        try {
            const response = await fetchWithRetry(`${HF_INFERENCE_API_BASE_URL}/${modelId}/status`, {
                headers: { Authorization: `Bearer ${hfToken}` }
            });
            const status = await response.json();
            return status.state === 'Loaded';
        } catch (error) {
            console.warn(`Model ${modelId} is not available:`, error);
            return false;
        }
    }

    // --- Token Validation ---
    validateTokenBtn.addEventListener('click', async () => {
        clearAlert(tokenAlert);
        const token = hfTokenInput.value.trim();
        if (!token) {
            showAlert(tokenAlert, 'Please enter your Hugging Face token.', 'error');
            return;
        }

        setLoading(validateTokenBtn, true);
        try {
            const response = await fetchWithRetry(`${HF_API_BASE_URL}/whoami-v2`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const userData = await response.json();
            hfToken = token;
            showAlert(tokenAlert, `Token validated! Welcome, ${userData.name}!`, 'success');
            modelPopup.style.display = 'block';
            fetchModels();
        } catch (error) {
            console.error('Token validation error:', error);
            showAlert(tokenAlert, error.message, 'error');
        } finally {
            setLoading(validateTokenBtn, false);
        }
    });

    // --- Fetch Models ---
    async function fetchModels() {
        console.log('Fetching models...');
        setLoading(popupModelLoading, true);
        clearAlert(popupModelAlert);
        try {
            const response = await fetchWithRetry(`${HF_API_BASE_URL}/models?limit=50`, {
                headers: { Authorization: `Bearer ${hfToken}` }
            });

            let models = await response.json();
            models = models.filter(model => 
                model.pipeline_tag && 
                SUPPORTED_PIPELINE_TAGS.includes(model.pipeline_tag) && 
                model.id
            );

            availableModels = [];
            for (const model of models.slice(0, 10)) {
                const isAvailable = await isModelAvailable(model.id);
                if (isAvailable) {
                    availableModels.push(model);
                }
            }

            if (availableModels.length === 0) {
                throw new Error('No compatible and available models found.');
            }

            console.log('Models fetched and displayed successfully.');
            displayModels(availableModels);
            populateCategories(availableModels);
        } catch (error) {
            console.error('Fetch models error:', error);
            showAlert(popupModelAlert, error.message || 'Failed to load models.', 'error');
        } finally {
            setLoading(popupModelLoading, false);
            console.log('Model fetching process completed (finally block).');
        }
    }

    // --- Display Models ---
    function displayModels(models) {
        popupModelList.innerHTML = '';
        if (!models || models.length === 0) {
            popupModelList.innerHTML = '<p>No compatible and available models found.</p>';
            return;
        }

        models.forEach(model => {
            const modelCard = document.createElement('div');
            modelCard.className = 'model-card';
            modelCard.innerHTML = `
                <h3>${model.id}</h3>
                <p>Pipeline: ${model.pipeline_tag || 'N/A'}</p>
                <p class="model-details">Last Updated: ${new Date(model.lastModified).toLocaleDateString()}</p>
                <button class="primary-btn select-model-btn">Select</button>
            `;
            modelCard.querySelector('.select-model-btn').addEventListener('click', () => {
                selectModel(model.id, modelCard);
                modelPopup.style.display = 'none';
            });
            popupModelList.appendChild(modelCard);
        });
    }

    function selectModel(modelId, modelCardElement) {
        document.querySelectorAll('.model-card.selected').forEach(card => card.classList.remove('selected'));
        modelCardElement.classList.add('selected');
        selectedModelId = modelId;
        selectedModelNameDisplay.textContent = modelId;
        interactionSection.style.display = 'block';
        promptInput.focus();
    }

    // --- Populate Categories ---
    function populateCategories(models) {
        popupModelCategory.innerHTML = '<option value="">All Categories</option>';
        const categories = new Set(models.map(model => model.pipeline_tag).filter(tag => tag));
        Array.from(categories).sort().forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            popupModelCategory.appendChild(option);
        });
    }

    // --- Filter Models ---
    function filterModels() {
        const searchTerm = popupModelSearch.value.toLowerCase();
        const selectedCategory = popupModelCategory.value;

        const filteredModels = availableModels.filter(model => {
            const nameMatch = model.id.toLowerCase().includes(searchTerm);
            const categoryMatch = selectedCategory ? model.pipeline_tag === selectedCategory : true;
            return nameMatch && categoryMatch;
        });
        displayModels(filteredModels);
    }

    popupModelSearch.addEventListener('input', filterModels);
    popupModelCategory.addEventListener('change', filterModels);

    // --- Close Model Popup ---
    closeButton.addEventListener('click', () => {
        modelPopup.style.display = 'none';
    });

    // --- Query Model ---
    queryModelBtn.addEventListener('click', async () => {
        clearAlert(interactionAlert);
        const prompt = promptInput.value.trim();
        if (!prompt) {
            showAlert(interactionAlert, 'Please enter a prompt.', 'error');
            return;
        }
        if (!selectedModelId) {
            showAlert(interactionAlert, 'Please select a model first.', 'error');
            return;
        }

        console.log(`Querying model: ${selectedModelId} with prompt: "${prompt}"`);
        setLoading(interactionLoading, true);
        aiResponseDisplay.textContent = '';
        copyResponseBtn.style.display = 'none';
        clearResponseBtn.style.display = 'none';

        try {
            const response = await fetchWithRetry(`${HF_INFERENCE_API_BASE_URL}/${selectedModelId}`, {
                headers: {
                    Authorization: `Bearer ${hfToken}`,
                    'Content-Type': 'application/json'
                },
                method: 'POST',
                body: JSON.stringify({ inputs: prompt })
            });

            const result = await response.json();
            let formattedResponse = '';

            if (Array.isArray(result)) {
                formattedResponse = result
                    .map(item => item.generated_text || item.text || JSON.stringify(item))
                    .filter(text => text)
                    .join('\n\n');
            } else if (result.generated_text) {
                formattedResponse = result.generated_text;
            } else if (result.text) {
                formattedResponse = result.text;
            } else {
                formattedResponse = JSON.stringify(result, null, 2);
            }

            aiResponseDisplay.textContent = formattedResponse || 'No response generated.';
            copyResponseBtn.style.display = formattedResponse ? 'inline-block' : 'none';
            clearResponseBtn.style.display = formattedResponse ? 'inline-block' : 'none';

            // Add to history
            history.push({ prompt, response: formattedResponse });
            displayHistory();
        } catch (error) {
            console.error('Model query error:', error);
            showAlert(interactionAlert, error.message, 'error');
            aiResponseDisplay.textContent = `⚠️ Error: ${error.message}`;
        } finally {
            setLoading(interactionLoading, false);
            console.log('Model query process completed (finally block).');
        }
    });

    // --- Display Interaction History ---
    function displayHistory() {
        interactionHistory.innerHTML = '';
        history.forEach((item, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <h4>Prompt ${index + 1}: ${item.prompt}</h4>
                <pre>${item.response}</pre>
            `;
            interactionHistory.appendChild(historyItem);
        });
    }

    // --- Copy Response to Clipboard ---
    copyResponseBtn.addEventListener('click', async () => {
        const responseText = aiResponseDisplay.textContent;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(responseText);
                showAlert(interactionAlert, 'Response copied to clipboard!', 'success', 2000);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = responseText;
                textarea.style.position = 'fixed';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textarea);
                if (successful) {
                    showAlert(interactionAlert, 'Response copied to clipboard!', 'success', 2000);
                } else {
                    throw new Error('Copy command failed');
                }
            }
        } catch (err) {
            console.error('Failed to copy:', err);
            showAlert(interactionAlert, 'Failed to copy response. Try copying manually.', 'error', 2000);
        }
    });

    // --- Clear Response ---
    clearResponseBtn.addEventListener('click', () => {
        aiResponseDisplay.textContent = '';
        copyResponseBtn.style.display = 'none';
        clearResponseBtn.style.display = 'none';
        clearAlert(interactionAlert);
    });
});