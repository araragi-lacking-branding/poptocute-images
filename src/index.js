export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // if root path, show random image
    if (url.pathname === "/") {
      // list of image filenames inside public/images
      const images = ["img1.jpg", "img2.jpg", "img3.jpg"];

      // pick random
      const random = images[Math.floor(Math.random() * images.length)];

      // serve an HTML page with the random image
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>*cute* and *pop*</title>
            <style>
              body {
                background-color: white;
                text-align: center;
                font-family: 'Heisei Mincho W3', serif;
              }
              img { max-width: 80%; margin-top: 40px; }
              .disclaimer { margin-top: 20px; font-size: 0.9em; color: #555; }
            </style>
          </head>
          <body>
            <img src="/images/${random}" alt="Random Image">
            <div class="disclaimer">
              No images belong to the site. We are working on adding accreditation and reporting.
            </div>
          </body>
        </html>
        `,
        { headers: { "content-type": "text/html;charset=UTF-8" } }
      );
    }

    // else let the assets plugin serve static files
    return env.ASSETS.fetch(request);
  },
};
