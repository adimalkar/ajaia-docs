import { Link } from "react-router-dom";

export function NotFound({ message = "This page doesn't exist." }: { message?: string }) {
  return (
    <main className="empty-page">
      <h1>Not found</h1>
      <p>{message}</p>
      <Link to="/" className="btn btn-primary">
        Back to documents
      </Link>
    </main>
  );
}
