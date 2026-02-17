import { signIn, signUp } from "../lib/pocketbase";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useState } from "react";

function SignInForm() {
	const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
	const [error, setError] = useState<string | null>(null);
	const [showPassword, setShowPassword] = useState(false);

	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4 font-sans">
			<div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-xl transition-all duration-300 hover:shadow-2xl">
				<div className="bg-muted/30 p-8 text-center border-b border-border">
					<div className="mb-4 flex justify-center">
						<span className="text-4xl text-[var(--accent-orange)] drop-shadow-sm">
							◇
						</span>
					</div>
					<h1 className="text-2xl font-bold tracking-wider text-foreground uppercase">
						Mission Control
					</h1>
					<p className="mt-2 text-sm text-muted-foreground font-medium">
						{flow === "signIn"
							? "Welcome back, Commander."
							: "New Personnel Registration"}
					</p>
				</div>

				<div className="p-8">
					<form
						className="space-y-5"
						onSubmit={(e) => {
							e.preventDefault();
							setError(null);
							const formData = new FormData(e.target as HTMLFormElement);
							const email = formData.get("email") as string;
							const password = formData.get("password") as string;
							if (flow === "signIn") {
								void signIn(email, password).catch((error) => {
									setError(error.message);
								});
							} else {
								void signUp(email, password).catch((error) => {
									setError(error.message);
								});
							}
						}}
					>
						<div className="space-y-4">
							<div className="space-y-1.5">
								<label
									className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1"
									htmlFor="email"
								>
									Email Address
								</label>
								<input
									id="email"
									className="w-full bg-background text-foreground rounded-lg p-3 border border-border focus:border-[var(--accent-orange)] focus:ring-1 focus:ring-[var(--accent-orange)] outline-none transition-all placeholder:text-muted-foreground/50"
									type="email"
									name="email"
									placeholder="commander@mission.control"
									required
								/>
							</div>
							<div className="space-y-1.5 ">
								<label
									className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1"
									htmlFor="password"
								>
									Password
								</label>
								<div className="relative">
									<input
										id="password"
										className="w-full bg-background text-foreground rounded-lg p-3 border border-border focus:border-[var(--accent-orange)] focus:ring-1 focus:ring-[var(--accent-orange)] outline-none transition-all placeholder:text-muted-foreground/50"
										type={showPassword ? "text" : "password"}
										name="password"
										placeholder="••••••••"
										required
									/>
									<button
										type="button"
										onClick={() => setShowPassword(!showPassword)}
										className="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer"
									>
										{showPassword ? (
											<IconEyeOff className="w-5 h-5" />
										) : (
											<IconEye className="w-5 h-5" />
										)}
									</button>
								</div>
							</div>
						</div>

						<button
							className="w-full bg-foreground text-background font-bold py-3 px-4 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all shadow-md uppercase tracking-widest cursor-pointer"
							type="submit"
						>
							{flow === "signIn" ? "Execute Login" : "Initialize Account"}
						</button>

						<div className="text-center">
							<button
								type="button"
								className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-4 cursor-pointer"
								onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
							>
								{flow === "signIn"
									? "No credentials? Initialize new account."
									: "Already registered? Execute login."}
							</button>
						</div>

						{error && (
							<div className="mt-4 animate-in fade-in slide-in-from-top-2">
								<div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
									<span className="text-destructive text-lg">⚠️</span>
									<p className="text-foreground/80 font-mono text-xs leading-relaxed pt-1">
										{error}
									</p>
								</div>
							</div>
						)}
					</form>
				</div>
			</div>
		</div>
	);
}

export default SignInForm;
