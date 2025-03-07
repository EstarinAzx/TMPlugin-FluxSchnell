async function generate_image_with_fal_ai(params, userSettings) {
  const { type, prompt, image_url } = params;
  const { fal_ai_api_key, image_size = "square_1024", num_inference_steps = "35", num_images = "1", enable_safety_checker = "true" } = userSettings;
  
  let endpoint, requestBody;
  
  if (type === "text_to_image") {
    endpoint = "https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra";
    requestBody = { 
      prompt, 
      image_size, 
      num_inference_steps: parseInt(num_inference_steps), 
      num_images: parseInt(num_images), 
      enable_safety_checker: enable_safety_checker === "true",
      guidance_scale: 7.5,  // Added parameter for flux-pro
      negative_prompt: "blurry, bad quality, distorted proportions"  // Added negative prompt
    };
  } else if (type === "image_to_image") {
    endpoint = "https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/img2img";
    requestBody = { 
      image_url, 
      prompt,
      image_size, 
      num_inference_steps: parseInt(num_inference_steps), 
      num_images: parseInt(num_images), 
      enable_safety_checker: enable_safety_checker === "true",
      strength: 0.65,  // Adjusted for flux-pro
      guidance_scale: 7.5,  // Added parameter for flux-pro
      negative_prompt: "blurry, bad quality, distorted proportions"  // Added negative prompt
    };
  } else {
    return "**Error:** Invalid 'type' parameter. Must be 'text_to_image' or 'image_to_image'.";
  }
  
  try {
    const submitResponse = await fetch(endpoint, { 
      method: "POST", 
      headers: { 
        "Authorization": `Key ${fal_ai_api_key}`, 
        "Content-Type": "application/json" 
      }, 
      body: JSON.stringify(requestBody) 
    });
    
    if (!submitResponse.ok) { 
      const errorBody = await submitResponse.text(); 
      throw new Error(`Fal.ai API request failed: Status: ${submitResponse.status}, StatusText: ${submitResponse.statusText}, Body: ${errorBody}`); 
    }
    
    const { request_id } = await submitResponse.json();
    if (!request_id) throw new Error("Did not receive a request_id from Fal.ai API.");
    
    let result = null, attempts = 0;
    const maxAttempts = 40, pollInterval = 1500 + (parseInt(num_inference_steps) * 300); // Adjusted for higher quality model
    
    while (!result && attempts < maxAttempts) {
      attempts++;
      const statusResponse = await fetch(`https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/${request_id}/status`, { 
        headers: { "Authorization": `Key ${fal_ai_api_key}` } 
      });
      
      if (!statusResponse.ok) { 
        const errorBody = await statusResponse.text(); 
        throw new Error(`Fal.ai status check failed: Status: ${statusResponse.status}, StatusText: ${statusResponse.statusText}, Body: ${errorBody}`); 
      }
      
      const statusJson = await statusResponse.json();
      if (statusJson.status === "COMPLETED") {
        const resultResponse = await fetch(`https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/${request_id}`, { 
          headers: { "Authorization": `Key ${fal_ai_api_key}` } 
        });
        
        if (!resultResponse.ok) { 
          const errorBody = await resultResponse.text(); 
          throw new Error(`Fal.ai result fetch failed: Status: ${resultResponse.status}, StatusText: ${resultResponse.statusText}, Body: ${errorBody}`); 
        }
        
        result = await resultResponse.json();
        break;
      } else if (statusJson.status === "FAILED") throw new Error(`Fal.ai request failed: ${statusJson.error}`);
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    if (!result) throw new Error(`Fal.ai request timed out after ${maxAttempts} attempts.`);
    
    let markdownOutput = "";
    if (result.images?.length > 0) {
      for (let i = 0; i < result.images.length; i++) {
        const image = result.images[i];
        const altText = type === "text_to_image" ? result.prompt?.substring(0, 100) || "Generated Image" : `Generated image from ${image_url}`;
        markdownOutput += `![${altText + (result.images.length > 1 ? ` (Image ${i + 1} of ${result.images.length})` : "")}](${image.url})\n\n`;
      }
      return markdownOutput;
    } else return "No images were generated.";
  } catch (error) {
    return `**Error:** ${error.message}`;
  }
}
