import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — HatodGo" },
      {
        name: "description",
        content:
          "How HatodGo collects, uses, and protects your personal information when you use our delivery, errand, and ride services.",
      },
      { property: "og:title", content: "Privacy Policy — HatodGo" },
      {
        property: "og:description",
        content:
          "How HatodGo collects, uses, and protects your personal information.",
      },
    ],
  }),
  component: PrivacyPage,
});

const EFFECTIVE_DATE = "April 28, 2026";
const CONTACT_EMAIL = "support@hatodgo.net";

function PrivacyPage() {
  return (
    <PageShell>
      <article className="mx-auto max-w-3xl px-6 py-12 text-foreground">
        <header className="mb-10">
          <h1 className="font-display text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Effective {EFFECTIVE_DATE}
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-primary [&_a]:underline">
          <section>
            <p>
              HatodGo ("we", "us", "our") operates the HatodGo mobile application
              and website (together, the "Service") providing food delivery,
              parcel delivery (padala), errand running (pabili), and motorcycle
              ride-hailing in Cebu, Philippines. This Privacy Policy explains
              what information we collect, how we use it, and the choices you
              have. By using the Service you agree to this policy.
            </p>
          </section>

          <section>
            <h2>1. Information We Collect</h2>
            <p>We collect the following categories of information:</p>
            <ul>
              <li>
                <strong>Account information.</strong> Name, phone number, email
                address, and password when you sign up.
              </li>
              <li>
                <strong>Order &amp; transaction data.</strong> Pickup and drop-off
                addresses, items ordered, prices, payment method, and ratings.
              </li>
              <li>
                <strong>Location data.</strong> Real-time GPS location of your
                device while you have an active order or are working as a rider,
                so we can match orders, calculate fares, and show live tracking.
              </li>
              <li>
                <strong>Device information.</strong> Device model, OS version,
                app version, language, and crash logs used to keep the app
                working reliably.
              </li>
              <li>
                <strong>Communications.</strong> Messages you send to support and
                in-app chats with riders related to an order.
              </li>
            </ul>
          </section>

          <section>
            <h2>2. How We Use Your Information</h2>
            <ul>
              <li>To create and manage your account.</li>
              <li>To accept, dispatch, fulfill, and deliver your orders.</li>
              <li>To enable live order tracking between customers and riders.</li>
              <li>To process payments and prevent fraud.</li>
              <li>To send transactional notifications (e.g. "Your rider is here").</li>
              <li>To respond to support requests and improve the Service.</li>
              <li>To comply with Philippine law, including the Data Privacy Act of 2012 (RA 10173).</li>
            </ul>
          </section>

          <section>
            <h2>3. Sharing Your Information</h2>
            <p>We share information only when necessary:</p>
            <ul>
              <li>
                <strong>With riders and merchants</strong> involved in your
                order, limited to what they need to complete it (name, contact
                number, address, items).
              </li>
              <li>
                <strong>With payment processors</strong> to charge or refund you.
              </li>
              <li>
                <strong>With service providers</strong> that host our infrastructure (cloud hosting, maps, push notifications, analytics) under confidentiality obligations.
              </li>
              <li>
                <strong>When required by law</strong> or to protect the rights, safety, or property of HatodGo, our users, or the public.
              </li>
            </ul>
            <p>We do not sell your personal information.</p>
          </section>

          <section>
            <h2>4. Location Data</h2>
            <p>
              Location is used <em>only</em> while an order is in progress or
              while you are an active rider. You can revoke location access at
              any time in your device settings, but core features (matching,
              tracking, fare calculation) will not work without it.
            </p>
          </section>

          <section>
            <h2>5. Data Retention</h2>
            <p>
              We keep account and order records for as long as your account is
              active and for up to 5 years afterwards to comply with tax and
              accounting laws. You may request deletion at any time (see
              Section 7).
            </p>
          </section>

          <section>
            <h2>6. Security</h2>
            <p>
              We use encryption in transit (HTTPS/TLS), encrypted storage,
              role-based database access, and regular security reviews. No
              system is perfectly secure; please use a strong password and keep
              it confidential.
            </p>
          </section>

          <section>
            <h2>7. Your Rights</h2>
            <p>Under the Philippine Data Privacy Act you have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate information.</li>
              <li>Request deletion of your account and associated data.</li>
              <li>Object to or withdraw consent for certain processing.</li>
              <li>Lodge a complaint with the National Privacy Commission (privacy.gov.ph).</li>
            </ul>
            <p>
              To exercise any of these rights, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section>
            <h2>8. Children</h2>
            <p>
              HatodGo is not directed to children under 13 and we do not
              knowingly collect their data. If you believe a child has given us
              data, contact us and we will delete it.
            </p>
          </section>

          <section>
            <h2>9. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. Material changes will
              be announced in the app and the "Effective" date above will be
              updated.
            </p>
          </section>

          <section>
            <h2>10. Contact Us</h2>
            <p>
              HatodGo Data Protection Officer<br />
              Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><br />
              Balamban, Cebu, Philippines
            </p>
          </section>

          <p className="pt-6">
            <Link to="/">← Back to home</Link>
          </p>
        </div>
      </article>
    </PageShell>
  );
}
