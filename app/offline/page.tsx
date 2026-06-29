export default function OfflinePage() {
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>No connection — Sunline</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #14171C;
            color: #F6F5F1;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100dvh;
            padding: 24px;
            text-align: center;
          }
          .icon { font-size: 48px; margin-bottom: 16px; }
          h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; color: #F6F5F1; }
          p { font-size: 15px; color: #8A8F99; line-height: 1.5; max-width: 280px; }
          .dot {
            display: inline-block;
            width: 8px; height: 8px;
            border-radius: 50%;
            background: #E07B39;
            margin: 20px 3px 0;
            animation: pulse 1.2s ease-in-out infinite;
          }
          .dot:nth-child(2) { animation-delay: 0.2s; }
          .dot:nth-child(3) { animation-delay: 0.4s; }
          @keyframes pulse {
            0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
            40% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </head>
      <body>
        <div>
          <div className="icon">☀️</div>
          <h1>No connection</h1>
          <p>Check your signal and we&apos;ll pick up right where you left off.</p>
          <div>
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>
      </body>
    </html>
  );
}
