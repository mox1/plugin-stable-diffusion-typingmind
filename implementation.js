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
  const { prompt, style_preset: stylePresetParam } = params;
  const { stabilityAPIKey, style_preset: stylePresetSetting } = userSettings;
  const stylePreset = stylePresetParam ?? stylePresetSetting;
  validateAPIKey(stabilityAPIKey);

  try {
    const imageData = await generateImageFromStabilityAPI(
      stabilityAPIKey,
      prompt,
      {
        ...userSettings,
        style_preset: stylePreset,
      }
    );

    return imageData;
  } catch (error) {
    console.error('Error generating image:', error);
    throw new Error('Error: ' + error.message);
  }
}

async function image_editing_via_stable_diffusion_3(params, userSettings) {
  const { mode, image, prompt, search_prompt, select_prompt } = params;
  const { stabilityAPIKey, output_format } = userSettings;
  validateAPIKey(stabilityAPIKey);

  if (!mode) {
    throw new Error('Editing mode is required. Valid modes: erase, search_and_replace, search_and_recolor, remove_background');
  }

  if (!image) {
    throw new Error('An image attachment is required for editing.');
  }

  try {
    const imageData = await editImageFromStabilityAPI(
      stabilityAPIKey,
      mode,
      image,
      {
        prompt,
        search_prompt,
        select_prompt,
        output_format,
      }
    );

    return imageData;
  } catch (error) {
    console.error('Error editing image:', error);
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
  if (model.startsWith('sd3')) {
    // SD3 and 3.5 models (sd3.5-*) use the same endpoint with model parameter
    return 'https://api.stability.ai/v2beta/stable-image/generate/sd3';
  } else if (model === 'stable-image-ultra') {
    return 'https://api.stability.ai/v2beta/stable-image/generate/ultra';
  } else if (model === 'stable-image-core') {
    return 'https://api.stability.ai/v2beta/stable-image/generate/core';
  }

  // Fallback to core endpoint
  return 'https://api.stability.ai/v2beta/stable-image/generate/core';
}

function getEndpointForEditMode(mode) {
  const endpoints = {
    erase: 'https://api.stability.ai/v2beta/stable-image/edit/erase',
    search_and_replace: 'https://api.stability.ai/v2beta/stable-image/edit/search-and-replace',
    search_and_recolor: 'https://api.stability.ai/v2beta/stable-image/edit/search-and-recolor',
    remove_background: 'https://api.stability.ai/v2beta/stable-image/edit/remove-background',
  };

  const endpoint = endpoints[mode];
  if (!endpoint) {
    throw new Error(`Invalid editing mode: ${mode}. Valid modes are: ${Object.keys(endpoints).join(', ')}`);
  }
  return endpoint;
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
  if (model && model.startsWith('sd3')) {
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

async function editImageFromStabilityAPI(
  apiKey,
  mode,
  image,
  { prompt, search_prompt, select_prompt, output_format } = {}
) {
  const apiUrl = getEndpointForEditMode(mode);

  const body = new FormData();

  // Handle image - could be base64 data URL or raw base64
  let imageBlob;
  if (image.startsWith('data:')) {
    // Extract base64 from data URL
    const base64Data = image.split(',')[1];
    const mimeType = image.split(';')[0].split(':')[1];
    const binaryData = atob(base64Data);
    const bytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      bytes[i] = binaryData.charCodeAt(i);
    }
    imageBlob = new Blob([bytes], { type: mimeType });
  } else {
    // Assume raw base64
    const binaryData = atob(image);
    const bytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      bytes[i] = binaryData.charCodeAt(i);
    }
    imageBlob = new Blob([bytes], { type: 'image/png' });
  }
  body.append('image', imageBlob, 'image.png');

  // Add output format
  output_format && body.append('output_format', output_format);

  // Add mode-specific parameters
  if (mode === 'search_and_replace') {
    if (!prompt) {
      throw new Error('search_and_replace mode requires a prompt (what to replace with)');
    }
    if (!search_prompt) {
      throw new Error('search_and_replace mode requires a search_prompt (what to find)');
    }
    body.append('prompt', prompt);
    body.append('search_prompt', search_prompt);
  } else if (mode === 'search_and_recolor') {
    if (!prompt) {
      throw new Error('search_and_recolor mode requires a prompt (the new color)');
    }
    if (!select_prompt) {
      throw new Error('search_and_recolor mode requires a select_prompt (what object to recolor)');
    }
    body.append('prompt', prompt);
    body.append('select_prompt', select_prompt);
  }
  // erase and remove_background modes don't require prompt parameters

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
  const alt = escapeAlt(mode === 'remove_background' ? 'Background removed' : prompt || 'Edited image');
  return `![${alt}](data:image/${output_format || 'png'};base64,${data.image})`;
}
