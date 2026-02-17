import { useAuth, signOut } from "../lib/pocketbase";

function SignOutButton() {
	const { isAuthenticated } = useAuth();
	return (
		<>
			{isAuthenticated && (
				<button
					className="bg-muted text-muted-foreground rounded-md px-3 py-1.5 cursor-pointer hover:bg-accent hover:text-foreground text-xs font-medium transition-colors"
					onClick={() => signOut()}
				>
					Sign out
				</button>
			)}
		</>
	);
}

export default SignOutButton;
