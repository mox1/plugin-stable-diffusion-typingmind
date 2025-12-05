function escapeAlt(text) {
  if (!text) {
    return '';
  }

  return text
    .replace(/\\/g, '\\\\') // backslash first
    .replace(/\n/g, ' ') // no newlines in alt text
    .replace(/\[/g, '\\[') // escape [ and ]
    .replace(/\]/g, '\\]')
    .replace(/</g, '&lt;') // defensive: HTML-sensitive chars
    .replace(/>/g, '&gt;');
}

async function image_generation_via_stable_diffusion_3(params, userSettings) {
  const { prompt } = params;
  const { stabilityAPIKey } = userSettings;
  validateAPIKey(stabilityAPIKey);

  try {
    const imageData = await generateImageFromStabilityAPI(
      stabilityAPIKey,
      prompt,
      userSettings
    );

    return imageData;
  } catch (error) {
    console.error('Error generating image:', error);
    throw new Error('Error: ' + error.message);
  }
}

function validateAPIKey(apiKey) {
  if (!apiKey) {
    throw new Error(
      'Please set a Stable Diffusion API Key in the plugin settings.'
    );
  }
}

function getEndpointForModel(model) {
  // Default to core if no model specified
  if (!model) {
    return 'https://api.stability.ai/v2beta/stable-image/generate/core';
  }

  // Route to appropriate endpoint based on model
  if (model.startsWith('sd3') || model.startsWith('stable-diffusion-3.5')) {
    // SD3 and 3.5 models use the same endpoint with model parameter
    return 'https://api.stability.ai/v2beta/stable-image/generate/sd3';
  } else if (model === 'stable-image-ultra') {
    return 'https://api.stability.ai/v2beta/stable-image/generate/ultra';
  } else if (model === 'stable-image-core') {
    return 'https://api.stability.ai/v2beta/stable-image/generate/core';
  }

  // Fallback to core endpoint
  return 'https://api.stability.ai/v2beta/stable-image/generate/core';
}

async function generateImageFromStabilityAPI(
  apiKey,
  prompt,
  { output_format, aspect_ratio, model, negative_prompt, style_preset } = {}
) {
  const apiUrl = getEndpointForModel(model);

  const body = new FormData();

  body.append('prompt', prompt);

  output_format && body.append('output_format', output_format);
  aspect_ratio && body.append('aspect_ratio', aspect_ratio);
  
  // Append model parameter for SD3 and 3.5 models (they use the same endpoint)
  // Ultra and Core endpoints are model-specific and don't need the model parameter
  if (model && (model.startsWith('sd3') || model.startsWith('stable-diffusion-3.5'))) {
    body.append('model', model);
  }
  
  negative_prompt && body.append('negative_prompt', negative_prompt);
  style_preset && body.append('style_preset', style_preset);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      Accept: 'application/json; type=image/*',
    },
    body: body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Stability API error: ${response.status}, Message: ${errorText}`
    );
  }

  const data = await response.json();
  const alt = escapeAlt(prompt);
  return `![${alt}](data:image/${output_format || 'png'};base64,${data.image})`;
}
