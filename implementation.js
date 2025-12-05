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

async function image_editing_via_stable_diffusion_3(params, userSettings, resources) {
  const { mode, prompt, search_prompt, select_prompt } = params;
  const { stabilityAPIKey, output_format } = userSettings;
  validateAPIKey(stabilityAPIKey);

  if (!mode) {
    throw new Error('Editing mode is required. Valid modes: erase, search_and_replace, search_and_recolor, remove_background');
  }

  // Get image from user attachments
  const attachments = resources?.userMessage?.attachments || [];
  const imageAttachment = attachments.find(att => att.type && att.type.startsWith('image/'));
  
  if (!imageAttachment) {
    throw new Error('An image attachment is required for editing. Please attach an image to your message.');
  }

  try {
    const imageData = await editImageFromStabilityAPI(
      stabilityAPIKey,
      mode,
      imageAttachment.url,
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

async function editImageFromStabilityAPI(
  apiKey,
  mode,
  imageUrl,
  { prompt, search_prompt, select_prompt, output_format } = {}
) {
  const apiUrl = getEndpointForEditMode(mode);

  // Fetch the image from the URL
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  }
  const imageBlob = await imageResponse.blob();

  const body = new FormData();
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
